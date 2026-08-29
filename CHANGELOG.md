# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-08-29

### Added
- **SQLite-Native Knowledge Graph Engine (`src/graph.ts`)**: Tích hợp công cụ duyệt đồ thị $k$-hop bằng `WITH RECURSIVE` CTE trực tiếp trong SQLite, tính điểm lan truyền exponential decay ($\gamma$), cycle detection qua `json_array`/`json_each`, truy vết `getEntityLineage()`, `detectConflicts()`, `findOwner()`, và `graphHybridSearch()`.
- **Zero-Token Graph Extractor (`src/graph-extractor.ts`)**: Tự động bóc tách entities và typed edges (`DEPENDS_ON`, `IMPLEMENTS`, `SUPERSEDES`, `CONFLICTS_WITH`, `OWNED_BY`, `REFERENCES`) từ YAML frontmatter và Markdown `[[wikilinks]]`/`[text](./path.md)`.
- **3 Bảng Đồ Thị Tri Thức (`src/db.ts`)**: Bổ sung bảng `entities`, `edges`, `entity_chunk_map` có indexes đầy đủ và đồng bộ tức thì khi ingest.
- **5 Enterprise MCP Tools (Tổng cộng 13 Tools)**:
  - `impact_analysis`: Phân tích bán kính ảnh hưởng đa tầng (blast radius).
  - `graph_hybrid_search`: Tìm kiếm hybrid kết hợp mở rộng 1-hop các node liên quan.
  - `detect_conflicts`: Phát hiện xung đột chính sách/tài liệu.
  - `get_entity_lineage`: Truy vết cây phụ thuộc ngược (Requirement -> API -> Service -> Schema).
  - `find_owner`: Tìm team/chủ sở hữu qua `OWNED_BY` edges.
- **In-Process File Lock (`src/tools/file-tools.ts`)**: Cơ chế lock chống race condition và lost-update khi nhiều client gọi `append_note` / `write_note` đồng thời.
- **2-Pass Batch Embedding (`src/ingest.ts`)**: Tối ưu ingest pipeline gọi `embedBatch()` gom nhóm 10 chunks/request, giảm số lượng HTTP request từ $N+1$ xuống 1 request cho mỗi file.
- **Modular Tools Architecture (`src/tools/`)**: Tách toàn bộ 13 tools thành 3 module chuyên biệt (`search-tools.ts`, `file-tools.ts`, `graph-tools.ts`), rút gọn `mcp-server.ts` xuống ~140 dòng.
- **Pure RRF Unit Test Suite (`scripts/test-rrf.ts`)**: 7 test case cô lập trên mock data verify độ chính xác thuật toán Reciprocal Rank Fusion.
- **Cảnh báo bảo mật Auth**: Tự động log warning khi `MCP_AUTH_TOKEN` để trống.

## [0.1.0] - 2026-08-28

### Added
- **Database Layer (`src/db.ts`)**: Tích hợp SQLite native qua `node:sqlite` (`DatabaseSync`), tạo bảng `files`, `chunks`, bảng ảo `chunks_fts`, triggers FTS5 và serialize vector BLOB Float32.
- **Chunking Engine (`src/chunker.ts`)**: Hỗ trợ phân tích frontmatter với `gray-matter`, phân tách Markdown theo heading hierarchy (`H1 > H2 > H3`), và phân đoạn Plaintext với sliding window overlap.
- **Embedding & Contextual Retrieval (`src/embedder.ts`, `src/contextualizer.ts`)**: Tích hợp API embedding OpenAI-compatible (`nomic-embed-text`) và tạo câu ngữ cảnh theo phương pháp Anthropic Contextual Retrieval.
- **Incremental Ingest Pipeline (`src/ingest.ts`, `scripts/reindex.ts`)**: Thuật toán diff SHA256 file và chunk, chỉ re-embed các chunk thay đổi; tự động cascade xóa chunk khi file bị xóa.
- **Hybrid Search Engine (`src/search.ts`)**: Kết hợp SQLite FTS5 BM25 và Vector Cosine Similarity thông qua thuật toán Reciprocal Rank Fusion (RRF, k=60).
- **AWF Context Management**: Khởi tạo cấu trúc `.brain/` gồm `brain.json`, `session.json`, `handover.md` và tài liệu kiến trúc trong `docs/`.

