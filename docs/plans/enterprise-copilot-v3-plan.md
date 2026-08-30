# Kế hoạch Triển khai: Knowledge MCP v3.0 — Enterprise SOP & Knowledge Copilot

## Bối cảnh & Mục tiêu

Chuyển đổi **knowledge-mcp** từ công cụ hỗ trợ lập trình sang **Nền tảng Trợ lý Tri thức & Quy trình Doanh nghiệp (Enterprise SOP & Knowledge Copilot)** phục vụ toàn bộ các phòng ban (Nhân sự, Kế toán - Tài chính, Pháp chế, IT Helpdesk, Vận hành) tra cứu chính sách, hướng dẫn từng bước quy trình (SOP), tìm kiếm biểu mẫu và giải đáp thắc mắc nội bộ.

---

## 🎯 Mục tiêu Cốt lõi (Key Deliverables)

1. **Multi-Format Document Ingestion**: Hỗ trợ trực tiếp các định dạng văn phòng phổ biến nhất: **Word (`.docx`)**, **PDF (`.pdf`)**, **Excel (`.xlsx`)**, bên cạnh Markdown và PlainText.
2. **Business Graph Schema (Mở rộng Đồ thị Nghiệp vụ)**:
   - *Entity Types*: `policy`, `process`, `form`, `department`, `role`, `document`, `service`, `api`, `schema`, `team`.
   - *Edge Types*: `REQUIRES_FORM`, `APPROVED_BY`, `NEXT_STEP`, `APPLIES_TO`, `DEPENDS_ON`, `SUPERSEDES`, `CONFLICTS_WITH`, `OWNED_BY`, `REFERENCES`.
3. **Bộ MCP Tools Nghiệp vụ Doanh nghiệp**:
   - `get_sop_flow`: Trả về toàn bộ luồng quy trình từng bước, người duyệt, điều kiện rẽ nhánh và form liên quan.
   - `get_required_forms`: Tìm kiếm tất cả biểu mẫu/template cần thiết cho một thủ tục.
   - `check_policy_compliance`: Đối chiếu hành động/yêu cầu với các điều khoản quy định.
   - `department_search`: Tìm kiếm tri thức được giới hạn theo phạm vi phòng ban (`department`).
4. **Real-time Live File Watcher (Chokidar)**: Tự động cập nhật chỉ mục và đồ thị khi nhân viên copy/chỉnh sửa file Word, PDF, Markdown trong thư mục dùng chung (không cần chạy lệnh tay).
5. **Bộ Mẫu Tài liệu Doanh nghiệp Chuẩn**: Cung cấp sẵn template và dữ liệu mẫu cho HR, Kế toán, IT, Pháp chế để doanh nghiệp đưa vào sử dụng ngay.

---

## 🏗️ Thiết Kế Kỹ Thuật Chi Tiết

### 1. Multi-Format Ingestion Layer (`src/parsers/`)

Tách và bổ sung các parser chuyên biệt chuyển đổi tài liệu văn phòng thành Markdown có cấu trúc:

```
src/parsers/
  ├── docx-parser.ts      # Mammoth: Chuyển .docx -> Markdown sạch, bảo tồn heading & bảng
  ├── pdf-parser.ts       # pdf-parse: Bóc tách text và layout phân trang từ PDF
  ├── xlsx-parser.ts      # xlsx: Chuyển các bảng tra cứu/ma trận Excel -> Markdown Table
  └── parser-factory.ts   # Router điều phối parser dựa trên file extension
```

*Đặc tả luồng xử lý:*
```
File (.docx / .pdf / .xlsx / .md) 
   ──▶ Parser Factory 
   ──▶ Markdown chuẩn hóa (có Frontmatter/Headers) 
   ──▶ Chunker (Heading-aware) 
   ──▶ Batch Embedder (Vector) + FTS5 Sync (BM25) + Graph Extractor
```

---

### 2. Mở rộng Graph Schema & Auto-Extractor (`src/db.ts`, `src/graph-extractor.ts`)

#### A. Database Schema
Cập nhật constraints và type definitions trong `src/db.ts`:

```typescript
export type EntityType =
  | "document"
  | "policy"      // Chính sách, quy chế, nội quy
  | "process"     // Quy trình (SOP)
  | "form"        // Biểu mẫu, template đăng ký
  | "department"  // Phòng ban (HR, Finance, Tech, Legal...)
  | "role"        // Vai trò duyệt (Trưởng phòng, Giám đốc...)
  | "service"
  | "api"
  | "schema"
  | "team"
  | "concept";

export type EdgeType =
  | "REQUIRES_FORM"   // Quy trình cần điền biểu mẫu nào
  | "APPROVED_BY"     // Bước này do ai/role nào phê duyệt
  | "NEXT_STEP"       // Thứ tự bước trong quy trình (Bước 1 -> Bước 2)
  | "APPLIES_TO"      // Chính sách áp dụng cho phòng ban nào
  | "DEPENDS_ON"
  | "REFERENCES"
  | "IMPLEMENTS"
  | "SUPERSEDES"      // Văn bản mới thay thế văn bản cũ
  | "CONFLICTS_WITH"
  | "OWNED_BY";
```

#### B. Frontmatter Convention cho Tài liệu Doanh nghiệp
Quy định cấu trúc YAML ở đầu văn bản chính sách / quy trình:

```yaml
---
title: Quy trình Tạm ứng & Thanh toán Công tác phí
type: process
department: [Finance, HR, All]
owner: Phong-Ke-Toan
applies_to: Toan-Bo-Nhan-Vien
supersedes: QD-2024-CONG-TAC-PHI-OLD
requires_form:
  - Mau-01-De-Nghi-Tam-Ung
  - Mau-05-Bang-Ke-Hoa-Don
approved_by:
  - Truong-Phong-Truc-Tiep
  - Ke-Toan-Truong
  - Giam-Doc-Tai-Chinh
steps:
  - step: 1
    action: Lập đề nghị tạm ứng trên Mẫu 01
    approver: Truong-Phong-Truc-Tiep
  - step: 2
    action: Nộp Kế toán kiểm tra định mức
    approver: Ke-Toan-Thanh-Toan
  - step: 3
    action: Phê duyệt chi tiền
    approver: Giam-Doc-Tai-Chinh
---
```

---

### 3. Các Công Cụ MCP Nghiệp Vụ Mới (`src/tools/enterprise-tools.ts`)

| Tên Tool | Mô tả chức năng | Input Parameters | Output |
|:---|:---|:---|:---|
| **`get_sop_flow`** | Lấy toàn bộ luồng thực hiện của một quy trình theo từng bước, điều kiện, người duyệt và form cần nộp | `process_name`: string | JSON cấu trúc bước 1 $\rightarrow$ N, form đính kèm, người ký |
| **`get_required_forms`** | Liệt kê tất cả các biểu mẫu/template cần điền cho một thủ tục/chủ đề | `topic_or_process`: string | Danh sách form, đường dẫn file mẫu, phòng ban tiếp nhận |
| **`check_policy_compliance`** | Đối chiếu một tình huống cụ thể với các quy chế công ty | `scenario_description`: string | Các điều khoản liên quan, kết luận tuân thủ / vi phạm, rủi ro |
| **`department_search`** | Tìm kiếm tài liệu được lọc theo phòng ban (HR, Finance, Tech, Legal...) | `query`: string, `department`: string, `k`: number | Kết quả hybrid search lọc theo namespace phòng ban |

---

### 4. Real-Time File Watcher Daemon (`src/watcher.ts`)

* Tích hợp thư viện `chokidar` giám sát thư mục `VAULT_DIR`.
* **Debounce Window**: 800ms để gom nhóm các thay đổi khi người dùng lưu file nhanh.
* **Xử lý sự kiện**:
  - `add` / `change`: Gọi `runIngest({ onlyFile: fullPath })` chạy ngầm.
  - `unlink`: Xóa file metadata, cascade xóa chunks và entities liên quan trong SQLite.
* Chạy song song với Express server mà không làm tăng độ trễ truy vấn.

---

## 📋 Lộ trình Triển khai (Phases of Execution)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🚀 BƯỚC 1: DEPENDENCIES & PARSER LAYER                                     │
│   • Cài đặt: `mammoth` (Word), `pdf-parse` (PDF), `xlsx` (Excel), `chokidar`│
│   • Viết các parsers trong `src/parsers/`                                   │
│   • Unit test bộ parser với các file mẫu docx, pdf, xlsx                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🧠 BƯỚC 2: GRAPH SCHEMA & ENTERPRISE EXTRACTOR                             │
│   • Mở rộng `EntityType` & `EdgeType` trong `src/db.ts`                     │
│   • Nâng cấp `src/graph-extractor.ts` để bắt SOP steps, approvers, forms    │
│   • Nâng cấp `src/graph.ts` với hàm `getSopFlow()`, `getRequiredForms()`    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ BƯỚC 3: ENTERPRISE MCP TOOLS & WATCHER                                   │
│   • Tạo `src/tools/enterprise-tools.ts` và đăng ký vào server               │
│   • Viết `src/watcher.ts` và khởi chạy cùng `startServer()`                 │
│   • Cập nhật tổng số MCP Tools lên **17 tools**                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🏢 BƯỚC 4: BỘ VĂN BẢN MẪU & KIỂM THỬ TÍCH HỢP                              │
│   • Tạo kho mẫu quy trình tại `data/raw/enterprise-vault/`                  │
│     - HR: Quy chế Onboarding, Nghỉ phép, WFH                                │
│     - Finance: Quy trình Tạm ứng, Hoàn ứng, Hóa đơn                         │
│     - IT: Quy trình cấp quyền, Xử lý sự cố                                  │
│   • Chạy test suite toàn diện và reindex thử nghiệm                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧪 Kế hoạch Kiểm Thử (Verification Plan)

### 1. Automated Tests
* `scripts/test-parsers.ts`: Kiểm tra bóc tách file `.docx`, `.pdf`, `.xlsx` ra Markdown chuẩn.
* `scripts/test-sop-graph.ts`: Kiểm tra trích xuất SOP steps, forms, approvers và duyệt đồ thị quy trình.
* `scripts/test-watcher.ts`: Kiểm tra tự động reindex khi thêm/sửa/xóa file trong vault.
* `npx tsc --noEmit`: Đảm bảo 0 lỗi kiểu dữ liệu TypeScript.

### 2. Manual Verification Scenarios
* **Kịch bản 1 (Nhân sự)**: Hỏi AI *"Tôi muốn xin nghỉ phép kết hôn thì quy trình thế nào, cần giấy tờ gì?"* $\rightarrow$ AI trả lời đúng quy trình, người duyệt và link biểu mẫu.
* **Kịch bản 2 (Kế toán)**: Hỏi AI *"Đi công tác vượt định mức khách sạn có được thanh toán không?"* $\rightarrow$ AI trích dẫn đúng quy chế tài chính và chỉ ra quy trình xin phê duyệt ngoại lệ.
* **Kịch bản 3 (Watcher)**: Thả 1 file Word quy trình mới vào thư mục $\rightarrow$ Hỏi ngay trên chat $\rightarrow$ AI nhận diện được ngay mà không cần restart server.

---

> [!IMPORTANT]
> Toàn bộ kế hoạch trên tiếp tục duy trì nguyên tắc cốt lõi: **100% Local-first, dữ liệu lưu trong SQLite cục bộ, không gửi tài liệu nội bộ công ty ra cloud bên thứ 3.**
