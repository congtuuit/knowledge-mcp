# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-08-29

### Added
- **Streamable HTTP MCP Server (`src/mcp-server.ts`)**: Dựng Express server tích hợp `@modelcontextprotocol/sdk` Streamable HTTP transport tại `POST /mcp` và `GET /mcp`, hỗ trợ multi-session management qua `Mcp-Session-Id` header và Bearer Token authentication.
- **8 MCP Tools**: Đăng ký đầy đủ `hybrid_search`, `keyword_search`, `similar_notes`, `read_note`, `list_notes`, `context_for_query`, `write_note`, `append_note`.
- **Auto-Reindexing on Mutation**: Tự động gọi `runIngest({ onlyFile: path })` ngay sau khi Agent gọi `write_note` hoặc `append_note` để đồng bộ bộ nhớ tức thì.
- **Base64 Image Stripping (`src/chunker.ts`)**: Tự động loại bỏ các chuỗi ảnh nhúng base64 cồng kềnh trong tài liệu Markdown, giúp giảm dung lượng rác và tăng độ chính xác của vector embedding và FTS5 BM25.
- **Production README & Testing**: Hoàn thiện `README.md` chuẩn production, sơ đồ kiến trúc Mermaid, và bộ test suite toàn diện (`npm run test:all`) đạt 100% pass.
- **PM2 Local Daemon Deployment**: Đã triển khai và chạy ngầm thành công MCP server trên local với PM2, sẵn sàng kết nối Antigravity IDE / CLI (`mcp_config.json`).

## [0.1.0] - 2026-08-28

### Added
- **Database Layer (`src/db.ts`)**: Tích hợp SQLite native qua `node:sqlite` (`DatabaseSync`), tạo bảng `files`, `chunks`, bảng ảo `chunks_fts`, triggers FTS5 và serialize vector BLOB Float32.
- **Chunking Engine (`src/chunker.ts`)**: Hỗ trợ phân tích frontmatter với `gray-matter`, phân tách Markdown theo heading hierarchy (`H1 > H2 > H3`), và phân đoạn Plaintext với sliding window overlap.
- **Embedding & Contextual Retrieval (`src/embedder.ts`, `src/contextualizer.ts`)**: Tích hợp API embedding OpenAI-compatible (`nomic-embed-text`) và tạo câu ngữ cảnh theo phương pháp Anthropic Contextual Retrieval.
- **Incremental Ingest Pipeline (`src/ingest.ts`, `scripts/reindex.ts`)**: Thuật toán diff SHA256 file và chunk, chỉ re-embed các chunk thay đổi; tự động cascade xóa chunk khi file bị xóa.
- **Hybrid Search Engine (`src/search.ts`)**: Kết hợp SQLite FTS5 BM25 và Vector Cosine Similarity thông qua thuật toán Reciprocal Rank Fusion (RRF, k=60).
- **AWF Context Management**: Khởi tạo cấu trúc `.brain/` gồm `brain.json`, `session.json`, `handover.md` và tài liệu kiến trúc trong `docs/`.

