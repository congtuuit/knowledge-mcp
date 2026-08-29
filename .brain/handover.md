# 📋 HANDOVER DOCUMENT - Knowledge MCP Server v2.0 & v3.0 Plan

**📍 Trạng thái:** ✅ **v2.0 Hoàn thành 100% | v3.0 Enterprise SOP & Knowledge Copilot: Đã Lập Kế Hoạch Chi Tiết**  
**🌿 Git Branch:** `2.0` (commit `e213506`+)  
**📄 Tài liệu Kế hoạch v3.0:** [`docs/plans/enterprise-copilot-v3-plan.md`](file:///d:/git/knowledge-mcp/docs/plans/enterprise-copilot-v3-plan.md)  
**🔢 Kết quả v2.0:** 13 MCP Tools hoạt động ổn định, 100% test pass, sẵn sàng kết nối Antigravity / Claude Code / Cursor.

---

### ✅ CÁC TÍNH NĂNG ĐÃ HOÀN THÀNH & KIỂM THỬ:

#### 1. Core Hybrid RAG Engine (v1.0)
- **Database & Storage (`src/db.ts`)**: SQLite native (`node:sqlite`), bảng `files`, `chunks`, bảng ảo FTS5 (`chunks_fts`) có trigger tự động đồng bộ, vector BLOB `Float32Array`.
- **Chunking Engine (`src/chunker.ts`)**: Phân tách Markdown theo heading hierarchy (`H1 > H2 > H3`), bảo tồn metadata frontmatter (`gray-matter`), loại bỏ ảnh base64 cồng kềnh.
- **Embedding & Contextual Retrieval (`src/embedder.ts`, `src/contextualizer.ts`)**: Tương thích OpenAI embedding (`nomic-embed-text` / Gemini), sinh ngữ cảnh chunk tự động qua chat completion.
- **Incremental Ingestion (`src/ingest.ts`)**: Diff SHA256 file và chunk, chỉ re-embed chunk mới; 2-pass batch embedding (`embedBatch`) giảm tối đa HTTP round-trip.
- **Hybrid Search (`src/search.ts`)**: Kết hợp SQLite FTS5 BM25 + Vector Cosine qua thuật toán Reciprocal Rank Fusion (RRF, $k=60$).

#### 2. Enterprise Knowledge Graph Engine (v2.0)
- **Graph Database Schema (`src/db.ts`)**: 3 bảng `entities`, `edges`, `entity_chunk_map` có indexes đầy đủ, liên kết trực tiếp với chunk index.
- **Zero-Token Graph Extractor (`src/graph-extractor.ts`)**: Tự động parse entities và typed edges (`DEPENDS_ON`, `IMPLEMENTS`, `SUPERSEDES`, `CONFLICTS_WITH`, `OWNED_BY`, `REFERENCES`) từ YAML frontmatter và Markdown `[[wikilinks]]`/`[text](./path.md)`.
- **k-Hop Recursive CTE Engine (`src/graph.ts`)**: Chạy 100% trong SQLite bằng `WITH RECURSIVE` CTE, tính điểm lan truyền exponential decay ($\gamma$), cycle detection qua `json_array`/`json_each`, truy vết `getEntityLineage()`, `detectConflicts()`, `findOwner()`, và `graphHybridSearch()`.
- **Modular Tools Architecture (`src/tools/`)**:
  - `src/tools/search-tools.ts`: `hybrid_search`, `keyword_search`, `similar_notes`, `context_for_query`, `graph_hybrid_search`.
  - `src/tools/file-tools.ts`: `read_note`, `list_notes`, `write_note`, `append_note` (kèm in-process file lock chống race condition).
  - `src/tools/graph-tools.ts`: `impact_analysis`, `detect_conflicts`, `get_entity_lineage`, `find_owner`.
- **MCP Server (`src/mcp-server.ts`)**: Streamable HTTP transport tại `POST /mcp`, Bearer Token authentication (có cảnh báo khi để trống), multi-session management.

---

### 🔧 QUYẾT ĐỊNH KỸ THUẬT QUAN TRỌNG:
1. **Dùng SQLite Recursive CTE thay vì Postgres/Neo4j**: Tối ưu 100% cho local-first, zero-dependency, duyệt cây diễn ra bên trong database engine bằng pushdown computation.
2. **In-process File Locking (`withFileLock`)**: Bảo vệ dữ liệu ghi đồng thời, triệt tiêu race condition lost-update.
3. **2-Pass Batch Embedding**: Gom nhóm 10 chunks/request trong ingest pipeline, tăng tốc reindex 5-10x.

---

### 🚀 LỆNH NHANH CHO SESSION SAU:
- **Khởi động server**: `npm start` hoặc `pm2 restart knowledge-mcp`
- **Reindex dữ liệu vault**: `npm run reindex`
- **Chạy toàn bộ unit & integration tests**:
  ```powershell
  npx tsx scripts/test-chunker.ts; npx tsx scripts/test-db.ts; npx tsx scripts/test-rrf.ts; npx tsx scripts/test-graph.ts; npx tsx scripts/test-search.ts
  ```
- **Type check**: `npx tsc --noEmit`
- **Khôi phục ngữ cảnh session mới**: Gõ `/recap`

