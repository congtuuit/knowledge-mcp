# System Overview - Knowledge MCP Server

## 1. Mục tiêu kiến trúc
Knowledge MCP Server là một hệ thống lưu trữ và truy xuất tri thức cá nhân chạy hoàn toàn cục bộ (local-first), đóng vai trò Retrieval & Storage Layer cho các AI Coding Agents (Claude Code, Antigravity CLI, Codex/ChatGPT, v.v.).

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Agents (Clients)                      │
│   (Claude Code / Claude Desktop / Antigravity CLI / Codex)  │
└──────────────────────────────┬──────────────────────────────┘
                               │ MCP (Streamable HTTP)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Knowledge MCP Server (Node.js/Express)         │
│                                                             │
│  ┌────────────────────────┐    ┌─────────────────────────┐  │
│  │   MCP Tools Handler    │    │  Auth (Bearer Token)    │  │
│  └───────────┬────────────┘    └─────────────────────────┘  │
│              │                                              │
│  ┌───────────▼───────────────────────────────────────────┐  │
│  │ Hybrid Search Engine (BM25 + Vector Cosine + RRF)      │  │
│  └──────┬────────────────────────────────────────┬───────┘  │
│         │                                        │          │
│  ┌──────▼───────────┐                  ┌─────────▼───────┐  │
│  │ SQLite FTS5      │                  │ Vector Search   │  │
│  │ (BM25 Fulltext)  │                  │ (Float32 Cosine)│  │
│  └──────┬───────────┘                  └─────────┬───────┘  │
│         │                                        │          │
│  ┌──────▼────────────────────────────────────────▼───────┐  │
│  │ SQLite Database (knowledge.db via node:sqlite)        │  │
│  │ (files, chunks, chunks_fts virtual table + triggers)  │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │ Ingestion & Chunking Pipeline                         │  │
│  │ - Gray-matter frontmatter parser                      │  │
│  │ - Heading-based hierarchical chunker with overlap     │  │
│  │ - Contextual Retrieval generator (Anthropic prompt)   │  │
│  │ - SHA256 Diffing Engine (re-embed only modified)      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 2. Core Modules

| Module | File | Chức năng |
|---|---|---|
| **Config** | `src/config.ts` | Tải và xác thực cấu hình từ biến môi trường (`.env`) |
| **Database** | `src/db.ts` | Khởi tạo SQLite schema, triggers FTS5, CRUD operations, serialize/deserialize embedding BLOB |
| **Chunker** | `src/chunker.ts` | Phân tách Markdown theo heading hierarchy (`H1 > H2 > H3`) và plain text theo paragraph có sliding window overlap |
| **Embedder** | `src/embedder.ts` | Tương tác endpoint embedding OpenAI-compatible (`/v1/embeddings`), xử lý batch & error fallback |
| **Contextualizer**| `src/contextualizer.ts` | Tạo 1-2 câu ngữ cảnh tóm tắt vị trí chunk trong văn bản trước khi embed |
| **Ingestion** | `src/ingest.ts` | Quét thư mục `VAULT_DIR`, tính toán SHA256 diff, đồng bộ hóa SQLite DB và xóa chunk mồ côi |
| **Search Engine** | `src/search.ts` | Thực hiện tìm kiếm FTS5 BM25, vector cosine similarity và kết hợp bằng Reciprocal Rank Fusion (RRF) |
| **MCP Server** | `src/mcp-server.ts` | Express server vận hành `StreamableHTTPServerTransport` (multi-session) và 8 MCP tools |

