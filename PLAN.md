# PLAN.md — Knowledge MCP Server

> Tài liệu này dành cho một AI coding agent (Claude Code, Codex CLI, Antigravity
> CLI, hoặc bất kỳ agent nào khác) đọc và triển khai đầy đủ dự án.
> Đọc toàn bộ file này trước khi viết bất kỳ dòng code nào. Làm theo đúng thứ tự
> Phase 0 → Phase 6. Sau mỗi phase, chạy phần "Definition of Done" tương ứng
> trước khi qua phase tiếp theo. Nếu có xung đột giữa PLAN.md và trực giác của
> agent, PLAN.md thắng — đây là spec đã được người dùng duyệt.

## 0. Mục tiêu sản phẩm

Xây một **kho kiến thức cá nhân, chạy hoàn toàn local**, đọc file `.md`/`.txt`
từ một thư mục do người dùng chỉ định, tạo chỉ mục hybrid search (vector +
full-text) local bằng SQLite, và **expose toàn bộ khả năng đó qua một MCP
server dùng transport streamable-HTTP**, để nhiều AI agent (Claude Code,
ChatGPT/Codex, Antigravity CLI, v.v.) có thể kết nối cùng lúc và:

1. Tra cứu (đọc) thông tin trong kho kiến thức để trả lời câu hỏi.
2. Ghi/cập nhật kho kiến thức (agent tự lưu lại note mới khi cần).

Không dùng cloud vector DB, không phụ thuộc 1 LLM provider cụ thể cho việc
sinh câu trả lời (agent bên ngoài tự lo phần đó) — server này **chỉ** đóng
vai trò retrieval + storage layer.

## 1. Ràng buộc & quyết định kiến trúc đã chốt

Đây là các quyết định đã được người dùng xác nhận qua trao đổi trước đó.
**Không đổi các quyết định này** trừ khi người dùng yêu cầu rõ ràng:

| Quyết định | Giá trị đã chọn | Lý do |
|---|---|---|
| Ngôn ngữ | Node.js + TypeScript | Người dùng chọn, quen JS/TS sẵn |
| MCP transport (MVP) | streamable HTTP | Dùng được với Antigravity remote + nhiều client cùng lúc |
| SDK | `@modelcontextprotocol/sdk` | SDK chính thức |
| Storage | SQLite (`better-sqlite3`) — 1 file `.db` | Local, không daemon, dễ backup |
| Keyword search | SQLite FTS5 (built-in) | Không cần dependency ngoài |
| Vector search | Brute-force cosine trong JS, embedding lưu dạng JSON/BLOB trong SQLite | Đủ nhanh cho vài nghìn chunk; đơn giản, không cần native vector extension dễ vỡ. Có thể nâng cấp lên `sqlite-vec` sau nếu cần (xem Phase 6). |
| Fusion | Reciprocal Rank Fusion (RRF) giữa kết quả FTS5 và vector | Đã thống nhất ở thiết kế trước |
| Embedding | Gọi endpoint kiểu OpenAI `/v1/embeddings` (mặc định trỏ Ollama local `nomic-embed-text`) | Không khoá cứng 1 provider |
| Contextual Retrieval | Bật, gọi 1 lần lúc ingest qua endpoint chat OpenAI-compatible (9router) để sinh câu ngữ cảnh cho mỗi chunk trước khi embed | Kỹ thuật của Anthropic, giảm 49–67% tỷ lệ truy xuất sai — xem Phase 3 |
| Auth | Bearer token đơn giản qua header `Authorization`, đọc từ `.env` | Đủ cho use case cá nhân, không cần OAuth phức tạp ở MVP |
| Không dùng | Docker, Postgres, LangChain/LlamaIndex framework nặng | Người dùng ưu tiên tự viết pipeline gọn, ít phụ thuộc |

## 2. Trạng thái hiện tại của repo (đã có sẵn — KHÔNG viết lại)

```
knowledge-mcp/
├── .env.example       ✅ đã có — copy sang .env và điền giá trị thật
├── package.json       ✅ đã có — dependencies đã khai báo đủ, chỉ cần npm install
├── tsconfig.json       ✅ đã có
├── src/
│   └── config.ts       ✅ đã có — đọc toàn bộ config từ .env, export object `config`
├── scripts/             (rỗng, cần tạo file)
├── data/raw/            (rỗng, nơi người dùng thả file .md/.txt vào)
└── db/                  (rỗng, nơi file knowledge.db sẽ được tạo)
```

Đọc kỹ `src/config.ts` trước khi viết các module khác — mọi module phải
import `config` từ đây, **không hardcode** đường dẫn/URL/model name ở nơi khác.

## 3. Việc cần làm — theo Phase

### Phase 1 — Database layer (`src/db.ts`)

Tạo schema SQLite với các bảng sau (dùng `better-sqlite3`, đồng bộ, không async):

```sql
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,          -- uuid
  path TEXT UNIQUE NOT NULL,    -- đường dẫn tương đối so với VAULT_DIR
  file_hash TEXT NOT NULL,      -- sha256 toàn bộ nội dung file, để detect thay đổi
  mtime INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,          -- uuid
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  heading_path TEXT,            -- vd "H1 > H2 > H3", rong neu la .txt
  content TEXT NOT NULL,        -- noi dung goc CHUA co prefix ngu canh
  contextualized_content TEXT,  -- noi dung DA prepend cau ngu canh (dung de embed + FTS)
  content_hash TEXT NOT NULL,   -- sha256(content) — dung de diff khi file thay doi
  embedding BLOB,               -- Float32Array serialized, NULL neu embed that bai
  embedding_model TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(content_hash);

-- FTS5 virtual table, dong bo qua trigger
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  contextualized_content,
  content='chunks',
  content_rowid='rowid'
);

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

Export các hàm helper (không export raw `Database` object cho module khác dùng
tuỳ tiện — mọi truy vấn phải đi qua hàm có tên rõ ràng):

- `getDb(): Database.Database` — singleton, tạo file `config.dbPath` nếu chưa có, chạy schema ở trên bằng `db.exec(...)`.
- `upsertFile(path, fileHash, mtime): fileId`
- `getFileByPath(path): FileRow | undefined`
- `deleteFile(fileId): void` (cascade xoá chunks nhờ `ON DELETE CASCADE` — nhớ bật `PRAGMA foreign_keys = ON`)
- `getChunksByFile(fileId): ChunkRow[]`
- `insertChunk(...)`, `deleteChunk(id)`
- `getAllChunksWithEmbedding(): ChunkRow[]` — dùng cho vector search brute-force

**Định dạng lưu embedding**: convert `number[]` → `Buffer` bằng
`Buffer.from(Float32Array.from(vec).buffer)`, đọc ngược lại bằng
`new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4)`.

**Definition of Done Phase 1**: viết 1 script test nhanh (`scripts/test-db.ts`,
tạm thời, có thể xoá sau) insert 1 file giả + 1 chunk giả, query lại, in ra
console, xác nhận FTS5 trigger hoạt động (`SELECT * FROM chunks_fts WHERE chunks_fts MATCH 'test'`
phải trả kết quả).

### Phase 2 — Chunking (`src/chunker.ts`)

Input: nội dung file (string) + tên file.

Logic:
1. Nếu file `.md`: parse frontmatter bằng `gray-matter` trước (tách metadata,
   không đưa vào chunk). Sau đó chunk theo heading (`##`, `###`) — mỗi section
   là 1 chunk. Nếu 1 section vượt quá `config.chunk.maxTokensApprox` (ước lượng
   bằng `Math.ceil(text.length / 4)`), chia nhỏ tiếp theo đoạn văn (`\n\n`),
   giữ `overlapApprox` ký tự cuối của đoạn trước làm phần đầu đoạn sau.
2. Nếu file `.txt`: chunk theo đoạn văn (`\n\n`), gộp các đoạn liền kề cho tới
   khi gần chạm `maxTokensApprox`, có overlap giống trên.
3. Mỗi chunk trả về: `{ headingPath: string, content: string }`.

Export: `chunkMarkdown(text: string): {frontmatter: object, chunks: {headingPath, content}[]}`
và `chunkPlainText(text: string): {headingPath: string, content: string}[]`.

**Definition of Done Phase 2**: unit test thủ công với 1 file markdown mẫu có
3 heading level 2 và 1 đoạn dài hơn `maxTokensApprox` — xác nhận đoạn dài bị
chia đúng, có overlap, không heading nào bị mất.

### Phase 3 — Embedding & Contextual Retrieval (`src/embedder.ts`, `src/contextualizer.ts`)

**`src/embedder.ts`**:
- `embedText(text: string): Promise<number[]>` — gọi `POST {config.embedding.baseUrl}/embeddings`
  với body `{ model: config.embedding.model, input: text }`, header
  `Authorization: Bearer {config.embedding.apiKey}`. Parse `data[0].embedding`.
- `embedBatch(texts: string[]): Promise<number[][]>` — gọi song song có giới
  hạn concurrency (dùng vòng lặp batch size ~5, không cần thêm thư viện ngoài).
- Bọc try/catch: nếu embed 1 chunk thất bại, log lỗi, trả `null` cho chunk đó
  thay vì crash toàn bộ batch (chunk vẫn được lưu, `embedding` = NULL, vẫn
  search được qua FTS5 — đúng nguyên tắc "best-effort" đã thấy ở các repo
  tham khảo).

**`src/contextualizer.ts`** (chỉ chạy nếu `config.contextual.enabled === true`):
- `generateContext(fullDocument: string, chunkContent: string): Promise<string>`
  — gọi `POST {config.contextual.baseUrl}/chat/completions` với system prompt:

  ```
  Bạn sẽ được cho toàn bộ tài liệu, và một đoạn trích (chunk) cụ thể từ tài liệu đó.
  Hãy viết 1-2 câu ngắn gọn (tiếng Việt) mô tả đoạn trích này nằm trong ngữ cảnh
  nào của tài liệu, để giúp cải thiện việc tìm kiếm đoạn trích này sau này.
  Chỉ trả về câu ngữ cảnh, không giải thích thêm, không lặp lại nội dung đoạn trích.
  ```

  User message chứa `<document>{fullDocument}</document>` và
  `<chunk>{chunkContent}</chunk>`. Nếu `fullDocument` quá dài (>12000 ký tự),
  cắt bớt phần giữa, giữ đầu + cuối tài liệu (không cần thuật toán phức tạp ở
  bản MVP).
- Trả về string, sẽ được prepend vào trước `content` gốc để tạo
  `contextualized_content` lưu trong DB (dùng cho cả FTS5 lẫn embedding).
- Nếu `config.contextual.enabled === false`, `contextualized_content = content`
  (không prepend gì).

**Definition of Done Phase 3**: chạy thử `embedText("xin chào")` với Ollama
local đang chạy (`ollama serve` + đã `pull nomic-embed-text`), xác nhận trả về
mảng số có độ dài đúng bằng `config.embedding.dim`. Nếu người dùng chưa có
Ollama chạy sẵn lúc agent triển khai, viết code đúng logic và ghi rõ trong
README rằng bước này cần Ollama chạy trước.

### Phase 4 — Ingest pipeline (`src/ingest.ts` + `scripts/reindex.ts`)

`src/ingest.ts` export hàm `runIngest(options?: { onlyFile?: string })`:

1. Duyệt đệ quy `config.vaultDir`, lọc file `.md` và `.txt`.
2. Với mỗi file:
   - Đọc nội dung, tính `sha256` toàn file.
   - So với `getFileByPath(relativePath)` trong DB:
     - Nếu chưa có hoặc `file_hash` khác → cần xử lý (file mới hoặc đã đổi).
     - Nếu giống hệt → bỏ qua, sang file tiếp theo.
   - Chunk file (Phase 2).
   - Với mỗi chunk mới: tính `sha256(content)`.
     - So sánh tập hash chunk mới vs tập chunk cũ (theo `file_id`) đã lưu
       trong DB (đúng logic diff đã thống nhất — xem PLAN mục 1, "Contextual
       Retrieval" không ảnh hưởng logic diff vì diff dựa trên `content` gốc,
       không phải `contextualized_content`).
     - Chunk có hash trùng → giữ nguyên, không embed lại.
     - Chunk mới (hash không có trong DB) → nếu `contextual.enabled`, gọi
       `generateContext`; sau đó `embedText`; insert vào DB.
     - Chunk cũ không còn xuất hiện trong bản mới → xoá khỏi DB.
   - Sau khi xử lý xong chunk, `upsertFile(...)` cập nhật `file_hash`, `mtime`.
3. Cuối cùng: các file có trong DB nhưng không còn tồn tại trên đĩa (đã bị
   xoá) → gọi `deleteFile(...)` để cascade xoá chunk liên quan.
4. In ra console tổng kết: số file mới, số file update, số file xoá, số chunk
   embed mới, số chunk bỏ qua (giữ nguyên).

`scripts/reindex.ts`: entrypoint CLI đơn giản, gọi `runIngest()`, in log, thoát.
Hỗ trợ flag `--file <path>` để chỉ reindex 1 file cụ thể (dùng
`options.onlyFile`).

**Definition of Done Phase 4**: tạo 3-5 file `.md` mẫu trong `data/raw/`
(nội dung bất kỳ, có thể lấy từ ví dụ trong README), chạy
`npm run reindex`, xác nhận DB có đúng số file/chunk, chạy lại lần 2 ngay sau
đó và xác nhận **không có chunk nào bị embed lại** (log phải in "0 chunk mới,
N chunk giữ nguyên"). Sau đó sửa nội dung 1 file, chạy lại, xác nhận chỉ chunk
thay đổi mới được embed lại.

### Phase 5 — Hybrid search (`src/search.ts`)

Export `hybridSearch(query: string, k: number = 8): Promise<SearchResult[]>`:

1. **Keyword search**: `SELECT chunks.*, bm25(chunks_fts) as score FROM chunks_fts JOIN chunks ON chunks.rowid = chunks_fts.rowid WHERE chunks_fts MATCH ? ORDER BY score LIMIT 30`.
   Escape query cho FTS5 (bọc mỗi từ trong dấu ngoặc kép nếu chứa ký tự đặc biệt).
2. **Vector search**: `embedText(query)`, sau đó lấy `getAllChunksWithEmbedding()`,
   tính cosine similarity trong JS, sort giảm dần, lấy top 30.
   > Ghi chú cho agent: đây là brute-force O(n), đủ nhanh tới vài chục nghìn
   > chunk. Nếu vault người dùng vượt quá ~50,000 chunk và thấy chậm, đề xuất
   > với người dùng việc chuyển sang `sqlite-vec` (xem Phase 6), **không tự ý
   > làm việc này ở MVP**.
3. **RRF fusion**: với `k_rrf = 60` (hằng số chuẩn của RRF), với mỗi chunk,
   `score = sum(1 / (k_rrf + rank + 1))` cộng dồn từ cả 2 danh sách (chunk
   không xuất hiện trong 1 danh sách thì chỉ cộng từ danh sách kia). Sort theo
   `score` giảm dần, trả về top `k`.
4. Mỗi kết quả trả về gồm: `content`, `headingPath`, `filePath`, `score`,
   `chunkId`.

Cũng export thêm 2 hàm đơn giản để MCP tool dùng riêng khi cần (không phải lúc
nào cũng cần hybrid): `keywordSearch(query, k)`, `vectorSearch(query, k)`.

**Definition of Done Phase 5**: viết script test tạm, query 2-3 câu hỏi khác
nhau (1 câu có từ khoá chính xác trong 1 file mẫu, 1 câu diễn đạt khác đi) —
xác nhận cả 2 trường hợp đều trả về đúng chunk liên quan ở vị trí top 3.

### Phase 6 — MCP Server (`src/mcp-server.ts`)

Dùng `@modelcontextprotocol/sdk`, transport
`StreamableHTTPServerTransport` (import từ
`@modelcontextprotocol/sdk/server/streamableHttp.js`), mount trên Express ở
route `POST /mcp` (theo đúng convention mà brain.md và các MCP server khác
dùng — client hiện có kỳ vọng path này).

**Middleware auth**: nếu `config.mcpAuthToken` khác rỗng, mọi request tới
`/mcp` phải có header `Authorization: Bearer {token}` khớp, nếu không trả
`401`. Nếu `config.mcpAuthToken` rỗng, bỏ qua check (chế độ dev, chỉ chạy
local).

**Danh sách tool cần implement** (dùng `server.tool(name, description, zodSchema, handler)`):

| Tool | Input schema (zod) | Logic |
|---|---|---|
| `hybrid_search` | `{ query: string, k?: number }` | Gọi `hybridSearch`, trả JSON kết quả |
| `keyword_search` | `{ query: string, k?: number }` | Gọi `keywordSearch` |
| `similar_notes` | `{ query: string, k?: number }` | Gọi `vectorSearch` |
| `read_note` | `{ path: string }` | Đọc file trực tiếp từ `config.vaultDir + path`, kiểm tra path traversal (chặn `..`), trả nội dung + `mtime` |
| `list_notes` | `{ prefix?: string }` | Liệt kê file trong vault, lọc theo prefix thư mục nếu có |
| `context_for_query` | `{ query: string, maxTokens?: number }` | Gọi `hybridSearch`, ghép các chunk thành 1 block markdown (mỗi chunk có header ghi rõ nguồn `filePath` + `headingPath`), cắt khi gần chạm `maxTokens` (mặc định 2000, ước lượng ký tự/4) |
| `write_note` | `{ path: string, content: string, overwrite?: boolean }` | Ghi file mới vào vault. Chặn path traversal. Nếu file đã tồn tại và `overwrite` không phải `true` → trả lỗi rõ ràng thay vì ghi đè âm thầm. **Sau khi ghi, tự động gọi `runIngest({ onlyFile: path })`** để reindex ngay chunk vừa ghi — đây là điểm quan trọng để "bộ nhớ" luôn đồng bộ với dữ liệu vừa agent ghi vào. |
| `append_note` | `{ path: string, content: string }` | Nếu file chưa tồn tại → tạo mới. Nếu có → append với 1 dòng trống ngăn cách. Cũng tự gọi `runIngest({ onlyFile: path })` sau khi ghi. |

Tất cả tool phải trả kết quả theo format MCP chuẩn:
`{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`.

**Khởi động server**: đọc `config.port`, log ra console dòng rõ ràng dạng
`Knowledge MCP server listening at http://localhost:{port}/mcp` khi start
thành công.

**Definition of Done Phase 6**: chạy `npm run dev`, dùng
`npx @modelcontextprotocol/inspector` (công cụ chính thức của Anthropic để
test MCP server) trỏ vào `http://localhost:3900/mcp`, xác nhận list được đủ 7
tool ở trên và gọi thử `hybrid_search` trả kết quả đúng.

## 4. README.md cần viết (sau khi code xong Phase 1-6)

Agent phải viết `README.md` ở gốc project, gồm các mục:

1. Giới thiệu ngắn (2-3 câu) — đây là gì, dùng để làm gì.
2. Yêu cầu cài đặt trước: Node.js ≥ 20, Ollama (nếu dùng embedding local),
   hướng dẫn `ollama pull nomic-embed-text`.
3. Cài đặt: `npm install`, `cp .env.example .env` rồi điền giá trị.
4. Cách thả tài liệu vào: copy file `.md`/`.txt` vào `data/raw/`.
5. Cách index: `npm run reindex`.
6. Cách chạy server: `npm run dev` (dev) hoặc `npm run build && npm run start` (production).
7. **Hướng dẫn kết nối cho từng agent** (đây là phần quan trọng nhất, viết
   chi tiết, có ví dụ JSON copy-paste được):
   - Claude Code / Claude Desktop: file `.mcp.json` hoặc
     `claude_desktop_config.json`, dùng `"type": "streamable-http", "url": "http://localhost:3900/mcp", "headers": {"Authorization": "Bearer YOUR_TOKEN"}` nếu có auth.
   - Antigravity CLI: file `~/.gemini/config/mcp_config.json` (global) hoặc
     `.agents/mcp_config.json` (theo workspace), cùng format `mcpServers`.
   - Codex CLI: ghi chú rằng cấu hình nằm trong file config riêng của Codex,
     người dùng cần tự kiểm tra tài liệu Codex hiện hành vì có thể thay đổi
     theo phiên bản (không đoán bừa cú pháp).
8. Mục "Khắc phục sự cố" cơ bản: lỗi thường gặp (Ollama chưa chạy, DB path
   sai, port bị chiếm...).

## 5. Việc KHÔNG làm ở giai đoạn này (out of scope cho MVP)

- Không xây knowledge graph / bảng `relations` (đã bàn ở thiết kế trước, để
  Phase sau nếu người dùng thấy cần).
- Không xây OAuth 2.1 — chỉ bearer token đơn giản.
- Không xây file watcher tự động (`chokidar`) — reindex là thao tác thủ công
  qua `npm run reindex` ở MVP này. Có thể thêm sau.
- Không viết UI web nào cả — đây là server thuần cho agent gọi qua MCP.
- Không dùng Docker.

## 6. Gợi ý nâng cấp sau MVP (ghi lại để không quên, không làm ngay)

- Chuyển vector search sang `sqlite-vec` khi vault > ~50,000 chunk.
- Thêm file watcher (`chokidar`) để tự reindex khi có thay đổi.
- Thêm bảng `relations` (knowledge graph nhẹ) như đã thiết kế ở trao đổi
  trước, cho phép agent tự đề xuất liên kết giữa các note.
- Thêm OAuth 2.1 + PKCE nếu muốn expose server ra ngoài mạng LAN/Internet an
  toàn hơn (tham khảo cách brain.md làm).
- Thêm summary layer (tóm tắt cấp file/project) cho câu hỏi tổng quan.

## 7. Checklist tổng để agent tự chấm trước khi báo "xong"

- [ ] `npm install` chạy sạch, không lỗi.
- [ ] `npm run build` compile TypeScript không lỗi.
- [ ] `npm run reindex` chạy được với ít nhất 3 file mẫu trong `data/raw/`.
- [ ] Chạy `reindex` lần 2 liên tiếp không embed lại chunk nào (verify bằng log).
- [ ] `npm run dev` khởi động server, log đúng URL.
- [ ] MCP Inspector kết nối được, liệt kê đủ 7 tool.
- [ ] `hybrid_search` trả kết quả hợp lý cho ít nhất 2 câu hỏi test khác nhau.
- [ ] `write_note` ghi file mới và file đó tìm được ngay qua `hybrid_search`
      mà không cần chạy `reindex` thủ công lại.
- [ ] `read_note` và `write_note` đều chặn được path traversal (`../../etc/passwd`).
- [ ] README.md đầy đủ, có ví dụ JSON cấu hình cho cả Claude Code và Antigravity CLI.
- [ ] `.env` không bị commit (kiểm tra `.gitignore` có dòng `.env` và `db/*.db`).
