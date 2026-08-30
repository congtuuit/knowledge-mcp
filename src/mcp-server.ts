import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { registerSearchTools } from "./tools/search-tools.js";
import { registerFileTools } from "./tools/file-tools.js";
import { registerGraphTools } from "./tools/graph-tools.js";

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

  registerSearchTools(server);
  registerFileTools(server);
  registerGraphTools(server);

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

  // Auth Middleware — Fix: warn when no token is configured
  if (!config.mcpAuthToken) {
    console.warn(
      "[Auth] WARNING: MCP_AUTH_TOKEN is not set. " +
      "Server is open to any local connection. " +
      "Set MCP_AUTH_TOKEN in .env if exposing over network."
    );
  }

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
      version: "0.2.0",
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


