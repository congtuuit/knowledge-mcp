# MCP API & Tools Documentation

**Ngày cập nhật:** 2026-08-28  
**Base URL:** `http://localhost:3900/mcp` (Streamable HTTP Transport)  
**Authentication:** `Authorization: Bearer <MCP_AUTH_TOKEN>` (Tùy chọn theo cấu hình `.env`)

---

## 🛠️ MCP Tools Overview

### 1. `hybrid_search`
Tìm kiếm kết hợp Full-Text BM25 và Semantic Vector Search thông qua Reciprocal Rank Fusion (RRF, k=60).

- **Input Schema:**
  - `query` (string, required): Câu hỏi hoặc nội dung cần tra cứu.
  - `k` (number, optional, default: 8): Số lượng kết quả hàng đầu trả về.
- **Output:** Mảng các kết quả gồm: `chunkId`, `filePath`, `headingPath`, `content`, `score`.

---

### 2. `keyword_search`
Tìm kiếm chính xác theo từ khóa bằng SQLite FTS5 BM25.

- **Input Schema:**
  - `query` (string, required): Từ khóa tra cứu.
  - `k` (number, optional, default: 8): Số kết quả tối đa.

---

### 3. `similar_notes`
Tìm kiếm theo độ tương đồng ngữ nghĩa vector cosine.

- **Input Schema:**
  - `query` (string, required): Đoạn văn bản cần tìm tương đồng.
  - `k` (number, optional, default: 8): Số kết quả tối đa.

---

### 4. `read_note`
Đọc nội dung đầy đủ của một file ghi chú trong vault.

- **Input Schema:**
  - `path` (string, required): Đường dẫn tương đối của file trong vault (chặn path traversal).
- **Output:** `{ path, content, mtime }`

---

### 5. `list_notes`
Liệt kê danh sách tất cả file ghi chú có trong vault.

- **Input Schema:**
  - `prefix` (string, optional): Lọc theo thư mục con hoặc tiền tố đường dẫn.
- **Output:** Mảng danh sách các đường dẫn file.

---

### 6. `context_for_query`
Tự động tìm kiếm và định dạng các đoạn context liên quan thành một khối văn bản Markdown sẵn sàng đưa vào context window của LLM.

- **Input Schema:**
  - `query` (string, required): Câu hỏi/truy vấn.
  - `maxTokens` (number, optional, default: 2000): Giới hạn độ dài token ước tính (characters / 4).
- **Output:** Markdown block tổng hợp các chunk kèm trích dẫn nguồn `filePath` & `headingPath`.

---

### 7. `write_note`
Ghi file ghi chú mới vào vault và tự động kích hoạt reindex incremental cho file đó ngay lập tức.

- **Input Schema:**
  - `path` (string, required): Đường dẫn file cần ghi trong vault.
  - `content` (string, required): Nội dung văn bản.
  - `overwrite` (boolean, optional, default: false): Cho phép ghi đè nếu file đã tồn tại.

---

### 8. `append_note`
Thêm nội dung vào cuối file ghi chú và tự động kích hoạt reindex ngay lập tức.

- **Input Schema:**
  - `path` (string, required): Đường dẫn file.
  - `content` (string, required): Nội dung cần thêm vào cuối file.
