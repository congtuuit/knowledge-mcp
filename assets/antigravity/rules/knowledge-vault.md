---
description: Tự động tra cứu Knowledge Vault khi người dùng hỏi về kiến thức dự án, kỹ thuật, Sitecore và coding standards
---

# Knowledge Vault Auto-Lookup Policy

## Quy tắc kích hoạt tự động (Auto Trigger Rule)
- Khi người dùng hỏi về: kiến trúc, quy chuẩn code, checklist, tài liệu dự án, kỹ thuật Sitecore/CMS, best practices...
- **LUÔN CHỦ ĐỘNG** gọi tool `context_for_query` hoặc `hybrid_search` từ MCP server `knowledge-vault` trước khi đưa ra câu trả lời.
- Người dùng không cần nhắc cụm từ "knowledge vault" hay "tài liệu nội bộ".
