import "dotenv/config";
import path from "node:path";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const config = {
  vaultDir: path.resolve(process.env.VAULT_DIR ?? "./data/raw"),
  dbPath: path.resolve(process.env.DB_PATH ?? "./db/knowledge.db"),
  port: Number(process.env.PORT ?? 3900),

  embedding: {
    baseUrl: required("EMBEDDING_BASE_URL", "http://localhost:11434/v1"),
    model: required("EMBEDDING_MODEL", "nomic-embed-text"),
    apiKey: process.env.EMBEDDING_API_KEY ?? "ollama",
    dim: Number(process.env.EMBEDDING_DIM ?? 768),
  },

  contextual: {
    enabled: (process.env.CONTEXTUAL_RETRIEVAL_ENABLED ?? "false") === "true",
    baseUrl: process.env.CHAT_BASE_URL ?? "",
    model: process.env.CHAT_MODEL ?? "",
    apiKey: process.env.CHAT_API_KEY ?? "",
  },

  mcpAuthToken: process.env.MCP_AUTH_TOKEN ?? "",

  chunk: {
    maxTokensApprox: 700, // ~ so tu, ky tu / 4 la uoc luong token
    overlapApprox: 100,
  },
};
