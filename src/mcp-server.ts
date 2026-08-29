import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { hybridSearch, keywordSearch, vectorSearch } from "./search.js";
import { runIngest } from "./ingest.js";

// ==========================================
// Security & Path Utilities
// ==========================================

export function resolveSafePath(inputPath: string): { fullPath: string; relPath: string } {
  const normalized = path.normalize(inputPath).replace(/^(\.\.[\/\\])+/, "");
  const fullPath = path.resolve(config.vaultDir, normalized);
  const relPath = path.relative(config.vaultDir, fullPath).replace(/\\/g, "/");

  if (relPath.startsWith("..") || path.isAbsolute(relPath) || relPath === "") {
    throw new Error(`Path traversal denied: '${inputPath}' is outside the vault directory.`);
  }

  return { fullPath, relPath };
}

interface VaultFileInfo {
  path: string;
  size: number;
  mtime: string;
}

export function listVaultFiles(dir: string, prefix?: string): VaultFileInfo[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results: VaultFileInfo[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listVaultFiles(fullPath, prefix));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".md" || ext === ".txt") {
        const relPath = path.relative(config.vaultDir, fullPath).replace(/\\/g, "/");
        if (!prefix || relPath.startsWith(prefix)) {
          const stat = fs.statSync(fullPath);
          results.push({
            path: relPath,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          });
        }
      }
    }
  }

  return results;
}

// ==========================================
// MCP Server & Tool Definitions
// ==========================================

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "knowledge-mcp",
    version: "0.1.0",
  });

  // Tool 1: hybrid_search
  server.tool(
    "hybrid_search",
    "Tìm kiếm kết hợp Full-text BM25 + Vector Cosine qua thuật toán Reciprocal Rank Fusion (RRF k=60)",
    {
      query: z.string().describe("Nội dung hoặc câu hỏi cần tìm trong knowledge vault"),
      k: z.number().optional().default(8).describe("Số lượng kết quả cần lấy (mặc định: 8)"),
    },
    async ({ query, k }) => {
      try {
        const results = await hybridSearch(query, k);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error executing hybrid search: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool 2: keyword_search
  server.tool(
    "keyword_search",
    "Tìm kiếm từ khóa chính xác qua SQLite FTS5 (BM25 ranking)",
    {
      query: z.string().describe("Từ khóa hoặc cụm từ cần tìm"),
      k: z.number().optional().default(8).describe("Số lượng kết quả cần lấy (mặc định: 8)"),
    },
    async ({ query, k }) => {
      try {
        const results = await keywordSearch(query, k);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error executing keyword search: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool 3: similar_notes
  server.tool(
    "similar_notes",
    "Tìm kiếm tương đồng ngữ nghĩa bằng Vector Cosine Similarity",
    {
      query: z.string().describe("Câu hỏi hoặc đoạn văn bản mẫu cần tìm các ghi chú tương đồng ngữ nghĩa"),
      k: z.number().optional().default(8).describe("Số lượng kết quả cần lấy (mặc định: 8)"),
    },
    async ({ query, k }) => {
      try {
        const results = await vectorSearch(query, k);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error executing vector search: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool 4: read_note
  server.tool(
    "read_note",
    "Đọc nội dung đầy đủ của một file ghi chú trong vault (chặn path traversal)",
    {
      path: z.string().describe("Đường dẫn tương đối của file trong vault (ví dụ: mcp-architecture.md hoặc docs/guide.md)"),
    },
    async ({ path: notePath }) => {
      try {
        const { fullPath, relPath } = resolveSafePath(notePath);

        if (!fs.existsSync(fullPath)) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `File not found: ${relPath}`,
              },
            ],
          };
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Target is a directory, not a file: ${relPath}`,
              },
            ],
          };
        }

        const content = fs.readFileSync(fullPath, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  path: relPath,
                  mtime: stat.mtime.toISOString(),
                  size: stat.size,
                  content,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error reading note: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool 5: list_notes
  server.tool(
    "list_notes",
    "Liệt kê danh sách tất cả các file ghi chú hiện có trong vault (hỗ trợ lọc theo prefix)",
    {
      prefix: z.string().optional().describe("Tiền tố đường dẫn hoặc thư mục để lọc (ví dụ: 'docs/' hoặc 'guides')"),
    },
    async ({ prefix }) => {
      try {
        const files = listVaultFiles(config.vaultDir, prefix);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  count: files.length,
                  vaultDir: config.vaultDir,
                  prefix: prefix ?? null,
                  notes: files,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error listing notes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool 6: context_for_query
  server.tool(
    "context_for_query",
    "Tìm kiếm và ghép các đoạn context liên quan nhất thành một khối Markdown sẵn sàng nhúng vào prompt (có giới hạn maxTokens)",
    {
      query: z.string().describe("Câu hỏi hoặc yêu cầu cần lấy ngữ cảnh"),
      maxTokens: z.number().optional().default(2000).describe("Giới hạn token ước tính cho ngữ cảnh (mặc định: 2000)"),
    },
    async ({ query, maxTokens }) => {
      try {
        const chunks = await hybridSearch(query, 15);
        let totalEstimatedTokens = 0;
        const includedSources: Array<{
          filePath: string;
          headingPath: string | null;
          score: number;
        }> = [];
        let contextMarkdown = "";

        for (const chunk of chunks) {
          const header = `### [${chunk.filePath}]${chunk.headingPath ? ` > ${chunk.headingPath}` : ""}\n`;
          const body = `${chunk.content}\n\n---\n\n`;
          const block = header + body;
          const estimatedTokens = Math.ceil(block.length / 4);

          if (totalEstimatedTokens + estimatedTokens > maxTokens && includedSources.length > 0) {
            break;
          }

          contextMarkdown += block;
          totalEstimatedTokens += estimatedTokens;
          includedSources.push({
            filePath: chunk.filePath,
            headingPath: chunk.headingPath,
            score: Number(chunk.score.toFixed(4)),
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query,
                  maxTokens,
                  estimatedTokens: totalEstimatedTokens,
                  chunksCount: includedSources.length,
                  sources: includedSources,
                  context: contextMarkdown.trim(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error retrieving context: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool 7: write_note
  server.tool(
    "write_note",
    "Tạo mới một file ghi chú trong vault và tự động cập nhật chỉ mục tìm kiếm (reindex) tức thì",
    {
      path: z.string().describe("Đường dẫn file cần tạo trong vault (ví dụ: notes/new-idea.md)"),
      content: z.string().describe("Nội dung ghi chú"),
      overwrite: z.boolean().optional().default(false).describe("Cho phép ghi đè nếu file đã tồn tại"),
    },
    async ({ path: notePath, content, overwrite }) => {
      try {
        const { fullPath, relPath } = resolveSafePath(notePath);

        if (fs.existsSync(fullPath) && !overwrite) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: File '${relPath}' already exists. Set overwrite=true to replace it.`,
              },
            ],
          };
        }

        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.writeFileSync(fullPath, content, "utf-8");

        // Auto-reindex this file immediately
        const ingestStats = await runIngest({ onlyFile: fullPath });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  path: relPath,
                  message: "Note written and reindexed successfully",
                  ingestStats,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error writing note: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool 8: append_note
  server.tool(
    "append_note",
    "Bổ sung thêm nội dung vào cuối một file ghi chú trong vault và tự động cập nhật chỉ mục tìm kiếm (reindex) tức thì",
    {
      path: z.string().describe("Đường dẫn file cần bổ sung nội dung trong vault (ví dụ: notes/journal.md)"),
      content: z.string().describe("Nội dung cần ghi thêm"),
    },
    async ({ path: notePath, content }) => {
      try {
        const { fullPath, relPath } = resolveSafePath(notePath);

        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        if (fs.existsSync(fullPath)) {
          const existing = fs.readFileSync(fullPath, "utf-8");
          const separator = existing.endsWith("\n") ? "\n" : "\n\n";
          fs.writeFileSync(fullPath, existing + separator + content, "utf-8");
        } else {
          fs.writeFileSync(fullPath, content, "utf-8");
        }

        // Auto-reindex this file immediately
        const ingestStats = await runIngest({ onlyFile: fullPath });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  path: relPath,
                  message: "Note appended and reindexed successfully",
                  ingestStats,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error appending note: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  return server;
}

// ==========================================
// Express Application & Transport Setup
// ==========================================

export async function startServer(customPort?: number): Promise<{
  app: express.Express;
  serverInstance: import("node:http").Server;
  sessions: Map<string, StreamableHTTPServerTransport>;
  port: number;
}> {
  // Ensure DB initialized
  getDb();

  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // Auth Middleware
  const authMiddleware: express.RequestHandler = (req, res, next) => {
    if (!config.mcpAuthToken) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: Missing or invalid Bearer token in Authorization header" },
        id: null,
      });
      return;
    }

    const token = authHeader.slice(7).trim();
    if (token !== config.mcpAuthToken) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: Bearer token does not match" },
        id: null,
      });
      return;
    }

    next();
  };

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  // Health check endpoint
  app.get(["/", "/health"], (_req, res) => {
    res.json({
      status: "ok",
      name: "knowledge-mcp",
      version: "0.1.0",
      vaultDir: config.vaultDir,
      dbPath: config.dbPath,
      activeSessions: sessions.size,
      authEnabled: Boolean(config.mcpAuthToken),
    });
  });

  // MCP Streamable HTTP endpoint
  app.all("/mcp", authMiddleware, async (req, res) => {
    const rawSessionId = req.headers["mcp-session-id"];
    const sessionId = typeof rawSessionId === "string" ? rawSessionId : undefined;

    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId);
    } else {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          if (transport) {
            sessions.set(id, transport);
          }
        },
        onsessionclosed: (id) => {
          sessions.delete(id);
        },
      });

      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
    }

    if (transport) {
      await transport.handleRequest(req, res, req.body);
    }
  });

  const activePort = customPort ?? config.port;

  const serverInstance = await new Promise<import("node:http").Server>((resolve, reject) => {
    const srv = app.listen(activePort, () => {
      console.log("\n============================================================");
      console.log("🧠 Knowledge MCP Server is running!");
      console.log(`📡 Streamable HTTP Endpoint : http://localhost:${activePort}/mcp`);
      console.log(`🏥 Health Check             : http://localhost:${activePort}/health`);
      console.log(`🔐 Authentication           : ${config.mcpAuthToken ? "Bearer Token Enabled" : "Disabled (Local Dev Mode)"}`);
      console.log(`📂 Vault Directory          : ${config.vaultDir}`);
      console.log(`🗄️  Database                 : ${config.dbPath}`);
      console.log("============================================================\n");
      resolve(srv);
    });
    srv.on("error", reject);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[Server] Shutting down gracefully...");
    for (const [id, transport] of sessions.entries()) {
      try {
        await transport.close();
      } catch (err) {
        // Ignore individual transport close errors
      }
      sessions.delete(id);
    }
    serverInstance.close(() => {
      console.log("[Server] Closed HTTP connections. Bye!");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { app, serverInstance, sessions, port: activePort };
}


// Auto-start if run directly
const isDirectRun = process.argv[1] && (
  path.basename(process.argv[1]) === "mcp-server.ts" || 
  path.basename(process.argv[1]) === "mcp-server.js"
);

if (isDirectRun) {
  startServer().catch((error) => {
    console.error("[Server] Fatal error during startup:", error);
    process.exit(1);
  });
}


