# Database Schema Documentation

## 1. Tổng quan
Hệ thống sử dụng SQLite cục bộ (mặc định tại `db/knowledge.db`) thông qua module tích hợp sẵn `node:sqlite` (`DatabaseSync`) của Node.js.

Các tính năng database bao gồm:
- Bật `PRAGMA foreign_keys = ON;` để tự động cascade xoá chunks khi file bị xóa.
- Bật `PRAGMA journal_mode = WAL;` để tối ưu hóa hiệu năng đọc/ghi đồng thời.
- Tự động đồng bộ hóa bảng `chunks` sang bảng ảo full-text `chunks_fts` qua SQLite Triggers.

---

## 2. Chi tiết các bảng

### 2.1. Bảng `files`
Lưu trữ thông tin metadata của từng file tài liệu trong vault.

```sql
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,          -- UUID v4
  path TEXT UNIQUE NOT NULL,    -- Đường dẫn tương đối so với VAULT_DIR (chuẩn hóa dấu /)
  file_hash TEXT NOT NULL,      -- SHA-256 toàn bộ nội dung file để detect thay đổi
  mtime INTEGER NOT NULL,       -- Thời gian chỉnh sửa file (ms)
  updated_at INTEGER NOT NULL   -- Timestamp cập nhật bản ghi trong DB (ms)
);
```

### 2.2. Bảng `chunks`
Lưu trữ từng đoạn trích nhỏ (chunk) được tạo ra từ file tài liệu.

```sql
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,          -- UUID v4
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL, -- Thứ tự của chunk trong file
  heading_path TEXT,            -- Phân cấp tiêu đề (vd: "H1 > H2 > H3"), NULL với plaintext
  content TEXT NOT NULL,        -- Nội dung gốc của đoạn trích
  contextualized_content TEXT,  -- Nội dung đã thêm tiền tố ngữ cảnh (dùng cho embed & FTS)
  content_hash TEXT NOT NULL,   -- SHA-256(content gốc) dùng để diff khi file thay đổi
  embedding BLOB,               -- Float32Array serialized thành nhị phân (NULL nếu embed fail)
  embedding_model TEXT,         -- Tên model dùng để tạo embedding
  created_at INTEGER NOT NULL   -- Timestamp tạo chunk (ms)
);

CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(content_hash);
```

### 2.3. Bảng ảo FTS5 `chunks_fts`
Sử dụng SQLite FTS5 extension để hỗ trợ BM25 keyword search tốc độ cao.

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  contextualized_content,
  content='chunks',
  content_rowid='rowid'
);
```

### 2.4. Triggers đồng bộ FTS5
Tự động đồng bộ các thao tác INSERT, DELETE, UPDATE từ bảng `chunks` sang `chunks_fts`:

```sql
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content, contextualized_content)
  VALUES (new.rowid, new.content, new.contextualized_content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content, contextualized_content)
  VALUES ('delete', old.rowid, old.content, old.contextualized_content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content, contextualized_content)
  VALUES ('delete', old.rowid, old.content, old.contextualized_content);
  INSERT INTO chunks_fts(rowid, content, contextualized_content)
  VALUES (new.rowid, new.content, new.contextualized_content);
END;
```
