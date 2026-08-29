# Hướng dẫn Cài đặt & Triển khai Knowledge MCP trên Máy Mới

Tài liệu này hướng dẫn chi tiết cách cài đặt, cấu hình và triển khai trọn gói **Knowledge MCP Server** trên một máy tính mới đã được cài đặt **9router** và **Antigravity IDE**.

---

## 📋 1. Yêu cầu tiên quyết (Prerequisites)

Trước khi tiến hành, hãy đảm bảo máy tính đã có sẵn:
1. **Node.js**: Phiên bản **>= 18.0.0** (Kiểm tra bằng `node -v` và `npm -v`).
2. **9router**: Đang chạy nền tại `http://localhost:20128/v1` (Cung cấp API Embedding và Chat Model).
3. **Antigravity IDE**: Đã được cài đặt trên máy.

---

## ⚡ 2. Cài đặt & Khởi chạy Tự động (1-Click All-in-One - Khuyến nghị)

Dự án đã tích hợp sẵn script duy nhất **`setup-and-run.bat`** (hoặc `setup-and-run.ps1`) để tự động hóa toàn bộ quy trình từ A đến Z.

### Cách thực hiện (Chỉ 1 thao tác):
* **Cách 1 (Đơn giản nhất):** Nhấp đúp (Double-click) vào file [`setup-and-run.bat`](file:///d:/git/knowledge-mcp/setup-and-run.bat) tại thư mục gốc của dự án.
* **Cách 2 (Qua Terminal / PowerShell):**
  ```powershell
  cd d:\git\knowledge-mcp
  .\setup-and-run.bat
  # hoặc: powershell -ExecutionPolicy Bypass -File .\setup-and-run.ps1
  ```

### Script duy nhất này sẽ tự động:
1. ✅ **Kiểm tra môi trường:** Node.js, npm và kiểm tra kết nối tới 9router (`http://localhost:20128/v1`).
2. ✅ **Khởi tạo cấu hình:** Tự động tạo file `.env` chuẩn hóa theo 9router.
3. ✅ **Cài đặt & Build:** Chạy `npm install` (nếu chưa có) và biên dịch TypeScript `npm run build`.
4. ✅ **Lập chỉ mục dữ liệu:** Tự động chunking, embedding và nạp toàn bộ ghi chú trong `data/raw/` vào SQLite FTS5 & Vector DB (`npm run reindex`).
5. ✅ **Tích hợp Antigravity:**
   * Đăng ký MCP Server `knowledge-vault` vào `~/.gemini/config/mcp_config.json`.
   * Cài đặt Global Rule `knowledge-vault.md` vào `~/.gemini/config/rules/` để AI tự động tra cứu ngầm.
   * Cài đặt Tool Schemas và `instructions.md` vào `~/.gemini/antigravity-ide/mcp/knowledge-vault/`.
6. ✅ **Khởi chạy Server:** Tự động bật HTTP Streamable Server tại `http://localhost:3900/mcp`. Bạn có thể mở Antigravity IDE và chat ngay!

---

## 🛠️ 3. Cài đặt thủ công (Manual Setup - Từng bước)

Nếu muốn tự thiết lập từng thành phần, bạn thực hiện theo các bước sau:

### Bước 1: Khởi tạo file cấu hình `.env`
Tạo file `.env` tại thư mục gốc dự án:
```env
# ---- Đường dẫn dữ liệu ----
VAULT_DIR=./data/raw
DB_PATH=./db/knowledge.db
PORT=3900

# ---- Embedding (9router) ----
EMBEDDING_BASE_URL=http://localhost:20128/v1
EMBEDDING_MODEL=gemini/gemini-embedding-2-preview
EMBEDDING_API_KEY=sk-dc085fc94dc709ea-8u73fh-aa082828
EMBEDDING_DIM=768

# ---- Contextual Retrieval (9router) ----
CONTEXTUAL_RETRIEVAL_ENABLED=true
CHAT_BASE_URL=http://localhost:20128/v1
CHAT_MODEL=mcp-local
CHAT_API_KEY=sk-dc085fc94dc709ea-8u73fh-aa082828

# ---- Bảo mật MCP (để trống khi chạy local) ----
MCP_AUTH_TOKEN=
```

### Bước 2: Cài đặt thư viện & Build mã nguồn
```bash
npm install
npm run build
```

### Bước 3: Lập chỉ mục dữ liệu ban đầu (Reindex)
Đặt các file tài liệu Markdown (`.md`) vào thư mục `data/raw/`, sau đó chạy:
```bash
npm run reindex
```

### Bước 4: Đăng ký MCP Server với Antigravity
Mở (hoặc tạo mới) file `C:\Users\<Tên_User>\.gemini\config\mcp_config.json` và thêm cấu hình:
```json
{
  "mcpServers": {
    "knowledge-vault": {
      "serverUrl": "http://localhost:3900/mcp"
    }
  }
}
```

### Bước 5: Cấu hình Rule Tự động tra cứu cho AI
Tạo file `C:\Users\<Tên_User>\.gemini\config\rules\knowledge-vault.md`:
```markdown
---
description: Tự động tra cứu Knowledge Vault khi người dùng hỏi về kiến thức dự án, kỹ thuật, Sitecore và coding standards
---

# Knowledge Vault Auto-Lookup Policy

## Quy tắc kích hoạt tự động (Auto Trigger Rule)
- Khi người dùng hỏi về: kiến trúc, quy chuẩn code, checklist, tài liệu dự án, kỹ thuật Sitecore/CMS, best practices...
- **LUÔN CHỦ ĐỘNG** gọi tool `context_for_query` hoặc `hybrid_search` từ MCP server `knowledge-vault` trước khi đưa ra câu trả lời.
- Người dùng không cần nhắc cụm từ "knowledge vault" hay "tài liệu nội bộ".
```

### Bước 6: Copy Tool Schemas và Instructions
Copy toàn bộ thư mục `assets/antigravity/mcp/knowledge-vault/` vào:
`C:\Users\<Tên_User>\.gemini\antigravity-ide\mcp\knowledge-vault\`

---

## 🚀 4. Khởi chạy Knowledge MCP Server

### Cách 1: Chạy bằng file Batch tiện ích (1-click)
Nhấp đúp vào file [`scripts/start-service.bat`](file:///d:/git/knowledge-mcp/scripts/start-service.bat) hoặc chạy lệnh trong PowerShell:
```powershell
.\scripts\start-service.ps1
```

### Cách 2: Chạy ngầm tự khởi động cùng Windows bằng PM2 (Khuyến nghị cho Production)
1. Cài đặt PM2 toàn cục:
   ```bash
   npm install -g pm2
   npm install -g pm2-windows-startup
   ```
2. Khởi chạy server dưới dạng background service:
   ```bash
   pm2 start dist/src/mcp-server.js --name "knowledge-mcp"
   ```
3. Lưu trạng thái và kích hoạt tự khởi động khi bật máy:
   ```bash
   pm2-startup install
   pm2 save
   ```

---

## 🧪 5. Kiểm tra & Thử nghiệm

1. **Kiểm tra trạng thái Server qua trình duyệt / curl:**
   * Health Check: [http://localhost:3900/health](http://localhost:3900/health) $\rightarrow$ Kết quả trả về `{"status":"ok", ...}`.
   * Endpoint MCP: `http://localhost:3900/mcp`
2. **Thử nghiệm trên Antigravity IDE:**
   * Mở Antigravity IDE, mở chat và đặt câu hỏi tự nhiên:
     > *"Khi nào nên dùng field Shared trong Sitecore và tại sao không nên dùng mutable static fields?"*
   * AI sẽ tự động kích hoạt tool `context_for_query` hoặc `hybrid_search` ngầm dưới nền và phản hồi theo tài liệu nội bộ.

---

## ❓ 6. Khắc phục sự cố thường gặp (Troubleshooting)

| Lỗi gặp phải | Nguyên nhân | Cách xử lý |
| :--- | :--- | :--- |
| `listen EADDRINUSE :::3900` | Cổng 3900 đang bị chiếm dụng bởi tiến trình khác. | Đổi `PORT=3901` trong file `.env` và cập nhật lại `serverUrl` trong `mcp_config.json`. |
| `Error: Connect ECONNREFUSED 127.0.0.1:20128` | 9router chưa được bật. | Khởi động 9router trước khi chạy `npm run reindex` hoặc khởi động MCP server. |
| AI không tự động gọi tool tra cứu | File Rule chưa được Antigravity nạp. | Kiểm tra file `~/.gemini/config/rules/knowledge-vault.md` hoặc tạo file `GEMINI.md` ngay tại root của workspace. |
| Thêm file tài liệu mới vào `data/raw/` nhưng AI chưa biết | Dữ liệu mới chưa được lập chỉ mục vector. | Chạy lệnh `npm run reindex` để cập nhật cơ sở dữ liệu. |
