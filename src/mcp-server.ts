import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { getDb, getEntityByName, searchEntitiesByName, getEntityCount, getEdgeCount } from "./db.js";
import { hybridSearch, keywordSearch, vectorSearch } from "./search.js";
import { runIngest } from "./ingest.js";
import { kHopNeighbors, detectConflicts, findOwner, getEntityLineage, graphHybridSearch } from "./graph.js";

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
    version: "0.2.0",
  });

  // Tool 1: hybrid_search
  server.tool(
    "hybrid_search",
    "Tìm kiếm tài liệu nội bộ kết hợp Full-text BM25 + Vector Cosine qua thuật toán Reciprocal Rank Fusion (RRF k=60) để tra cứu chi tiết các chunk kiến thức.",
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
    "TỰ ĐỘNG DÙNG công cụ này để tra cứu tài liệu nội bộ, quy chuẩn coding Sitecore, kiến trúc và best practices dự án khi người dùng hỏi các câu hỏi kỹ thuật/nghiệp vụ. Ghép các đoạn context liên quan nhất thành Markdown sẵn sàng nhúng vào prompt.",
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

  // ==========================================
  // Tool 9: impact_analysis
  // ==========================================
  server.tool(
    "impact_analysis",
    "Phân tích bán kính ảnh hưởng (blast radius) khi thay đổi một entity. Duyệt đồ thị K-hop bằng SQLite Recursive CTE để tìm tất cả các services, APIs, tài liệu liên quan bị tác động.",
    {
      entity_name: z.string().describe("Tên entity cần phân tích (service, API, doc, schema...)"),
      k: z.number().int().min(1).max(4).optional().default(2).describe("Số bước lan truyền tối đa (1-4, mặc định 2)"),
      edge_types: z
        .array(z.enum(["DEPENDS_ON", "REFERENCES", "IMPLEMENTS", "SUPERSEDES", "OWNED_BY", "CONFLICTS_WITH"]))
        .optional()
        .default(["DEPENDS_ON", "REFERENCES", "IMPLEMENTS"])
        .describe("Loại quan hệ cần duyệt"),
    },
    async ({ entity_name, k, edge_types }) => {
      try {
        const entity = getEntityByName(entity_name);
        if (!entity) {
          // Fuzzy fallback
          const candidates = searchEntitiesByName(entity_name, 5);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                found: false,
                message: `Entity '${entity_name}' not found in graph.`,
                suggestions: candidates.map((c) => ({ name: c.name, type: c.type })),
              }, null, 2),
            }],
          };
        }

        const affected = kHopNeighbors({
          startEntityId: entity.id,
          edgeTypes: edge_types as any,
          maxK: k,
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              source: { id: entity.id, name: entity.name, type: entity.type },
              maxK: k,
              edgeTypes: edge_types,
              affectedCount: affected.length,
              affected: affected.map((e) => ({
                name: e.name,
                type: e.type,
                filePath: e.file_path,
                influenceScore: Number(e.influence_score.toFixed(4)),
                depth: e.min_depth,
              })),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `impact_analysis error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );

  // ==========================================
  // Tool 10: graph_hybrid_search
  // ==========================================
  server.tool(
    "graph_hybrid_search",
    "Tìm kiếm hybrid (BM25 + Vector + RRF) kết hợp mở rộng 1-hop graph để trả về cả text chunks lẫn các entities liên quan đến kết quả tìm kiếm.",
    {
      query: z.string().describe("Nội dung cần tìm kiếm"),
      k: z.number().optional().default(8).describe("Số lượng chunks kết quả (mặc định 8)"),
    },
    async ({ query, k }) => {
      try {
        const results = await graphHybridSearch(query, k);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results.map((r) => ({
              chunkId: r.chunkId,
              filePath: r.filePath,
              headingPath: r.headingPath,
              content: r.content,
              score: r.score,
              relatedEntities: r.relatedEntities,
            })), null, 2),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `graph_hybrid_search error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );

  // ==========================================
  // Tool 11: detect_conflicts
  // ==========================================
  server.tool(
    "detect_conflicts",
    "Phát hiện các mâu thuẫn (CONFLICTS_WITH edges) giữa entity đầu vào và các tài liệu/chính sách khác trong knowledge graph.",
    {
      entity_name: z.string().describe("Tên entity cần kiểm tra mâu thuẫn"),
    },
    async ({ entity_name }) => {
      try {
        const entity = getEntityByName(entity_name);
        if (!entity) {
          return {
            content: [{ type: "text", text: JSON.stringify({ found: false, message: `Entity '${entity_name}' not found.` }) }],
          };
        }

        const conflicts = detectConflicts(entity.id);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              entity: { name: entity.name, type: entity.type },
              conflictCount: conflicts.length,
              conflicts: conflicts.map((c) => ({
                withEntity: c.entityB.name,
                withType: c.entityB.type,
                withFile: c.entityB.filePath,
                confidence: c.confidence,
              })),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `detect_conflicts error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );

  // ==========================================
  // Tool 12: get_entity_lineage
  // ==========================================
  server.tool(
    "get_entity_lineage",
    "Truy vết chuỗi phụ thuộc đầy đủ của một entity: từ Business Requirement -> API Spec -> Service -> Database Schema. Giúp hiểu nguồn gốc và tác động theo chiều sâu.",
    {
      entity_name: z.string().describe("Tên entity cần truy vết lineage"),
      max_depth: z.number().int().min(1).max(6).optional().default(4).describe("Độ sâu tối đa của cây phụ thuộc (mặc định 4)"),
    },
    async ({ entity_name, max_depth }) => {
      try {
        const entity = getEntityByName(entity_name);
        if (!entity) {
          const candidates = searchEntitiesByName(entity_name, 5);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                found: false,
                message: `Entity '${entity_name}' not found.`,
                suggestions: candidates.map((c) => ({ name: c.name, type: c.type })),
              }, null, 2),
            }],
          };
        }

        const lineage = getEntityLineage(entity.id, max_depth);
        return {
          content: [{ type: "text", text: JSON.stringify(lineage, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `get_entity_lineage error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );

  // ==========================================
  // Tool 13: find_owner
  // ==========================================
  server.tool(
    "find_owner",
    "Xác định team hoặc người chịu trách nhiệm (owner) của một entity trong knowledge graph thông qua OWNED_BY edges.",
    {
      entity_name: z.string().describe("Tên service, API, tài liệu cần tìm owner"),
    },
    async ({ entity_name }) => {
      try {
        const entity = getEntityByName(entity_name);
        if (!entity) {
          return {
            content: [{ type: "text", text: JSON.stringify({ found: false, message: `Entity '${entity_name}' not found.` }) }],
          };
        }

        const owner = findOwner(entity.id);
        const graphStats = { entityCount: getEntityCount(), edgeCount: getEdgeCount() };

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              entity: { name: entity.name, type: entity.type, filePath: entity.file_id },
              owner: owner ?? null,
              hasOwner: owner !== null,
              graphStats,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `find_owner error: ${error instanceof Error ? error.message : String(error)}` }],
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


// Auto-start if run directly or managed by PM2
const currentFilePath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

const isDirectRun = Boolean(
  process.env.pm_id !== undefined ||
  (entryPath && (
    entryPath === currentFilePath ||
    entryPath.endsWith("mcp-server.ts") ||
    entryPath.endsWith("mcp-server.js")
  ))
);

if (isDirectRun) {
  startServer().catch((error) => {
    console.error("[Server] Fatal error during startup:", error);
    process.exit(1);
  });
}


