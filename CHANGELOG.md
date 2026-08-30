# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-08-30

### Added
- **Enterprise Second Brain Benchmark Suite (`benchmarks/`)**:
  - Module tạo vault quy mô tự động (`synthetic-vault-generator.ts`) hỗ trợ scale `micro` (12 files), `standard` (510 files), `enterprise` (2,500+ files).
  - Trình nạp dataset chuẩn HotpotQA/Multi-hop (`hf-dataset-loader.ts`).
  - Hệ thống đo đạc chuẩn quốc tế BEIR/RAGAS (`metrics.ts`, `system-profiler.ts`, `benchmark-engine.ts`): HitRate@1, Recall@3/5/10, MRR, NDCG@5, Lineage Exact Match, Blast Radius F1, Conflict Recall, Ownership Accuracy.
  - Báo cáo trực quan `BENCHMARK_REPORT.md` tích hợp Mermaid Quadrant Chart và XY Bar Charts (gam màu xanh `#2563eb`).

### Fixed
- **Graph-Hybrid Evaluation Scoring (Bug #1)**: Sửa lỗi `benchmark-engine.ts` bỏ qua `relatedEntities` từ 1-hop expansion, gộp đầy đủ entity name vào `retrievedIds` giúp phản ánh chính xác hiệu quả Graph-RAG.
- **Blast Radius Incoming Traversal (Bug #2)**: Bổ sung nhánh truy vấn SQL đệ quy riêng cho `direction === "incoming"` trong `src/graph.ts` và cập nhật benchmark runner; tăng Blast Radius F1 từ ~18% lên 65.5%.
- **HitRate@1 Binary Metric Calculation (Bug #3)**: Tách riêng hàm `calculateHitRateAtK()` (binary 0/1) khỏi `calculateRecallAtK()` trong `metrics.ts`, loại bỏ bias với các câu hỏi có nhiều ground truth entities (HitRate@1 tăng lên 54.5%).

### Changed & Optimized
- **SQLite Performance Tuning (`src/db.ts`)**: Bổ sung các PRAGMA chuyên sâu: `synchronous = NORMAL`, `cache_size = -64MB`, `temp_store = MEMORY`, `mmap_size = 256MB`, `wal_autocheckpoint = 1000`.
- **Atomic Ingest SAVEPOINT (`src/ingest.ts`)**: Bọc toàn bộ chunk insert và graph extraction của từng file trong khối SAVEPOINT transaction tương thích với `node:sqlite`, giảm tải I/O ghi đĩa.
- **Tài liệu chiến lược tối ưu**: Tạo `optimization_strategy.md` và `benchmark_accuracy_audit.md` hoạch định lộ trình In-Process HNSW Vector Indexing và v3.0 Enterprise.

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

