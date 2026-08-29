# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-08-28

### Added
- **Database Layer (`src/db.ts`)**: Tích hợp SQLite native qua `node:sqlite` (`DatabaseSync`), tạo bảng `files`, `chunks`, bảng ảo `chunks_fts`, triggers FTS5 và serialize vector BLOB Float32.
- **Chunking Engine (`src/chunker.ts`)**: Hỗ trợ phân tích frontmatter với `gray-matter`, phân tách Markdown theo heading hierarchy (`H1 > H2 > H3`), và phân đoạn Plaintext với sliding window overlap.
- **Embedding & Contextual Retrieval (`src/embedder.ts`, `src/contextualizer.ts`)**: Tích hợp API embedding OpenAI-compatible (`nomic-embed-text`) và tạo câu ngữ cảnh theo phương pháp Anthropic Contextual Retrieval.
- **Incremental Ingest Pipeline (`src/ingest.ts`, `scripts/reindex.ts`)**: Thuật toán diff SHA256 file và chunk, chỉ re-embed các chunk thay đổi; tự động cascade xóa chunk khi file bị xóa.
- **Hybrid Search Engine (`src/search.ts`)**: Kết hợp SQLite FTS5 BM25 và Vector Cosine Similarity thông qua thuật toán Reciprocal Rank Fusion (RRF, k=60).
- **AWF Context Management**: Khởi tạo cấu trúc `.brain/` gồm `brain.json`, `session.json`, `handover.md` và tài liệu kiến trúc trong `docs/`.
