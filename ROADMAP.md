# 🗺️ Knowledge MCP - Development Roadmap

This document outlines the planned feature roadmap, architectural enhancements, and release milestones for **Knowledge MCP Server**.

---

## 📌 Release Milestones Overview

```mermaid
gantt
    title Knowledge MCP Strategic Roadmap
    dateFormat  YYYY-MM-DD
    section Completed
    v1.0 Core Hybrid RAG Engine          :done, v1, 2026-08-01, 2026-08-20
    v2.0 SQLite-Native Knowledge Graph   :done, v2, 2026-08-25, 2026-08-29
    section Planned Milestones
    Phase 1: Live File Watcher (Chokidar):active, p1, 2026-09-01, 2026-09-15
    Phase 2: Surgical Note Editing (AST) :p2, 2026-09-16, 2026-09-30
    Phase 3: Multi-format (PDF/DOCX/XLSX):p3, 2026-10-01, 2026-10-20
    Phase 4: Cross-Encoder Re-ranking    :p4, 2026-10-21, 2026-11-10
    Phase 5: Local Web Dashboard & GUI   :p5, 2026-11-11, 2026-11-30
```

---

## 🏆 Completed Releases

### 🧠 Release v2.0: SQLite-Native Enterprise Knowledge Graph Engine (Done - 2026-08-29)
* **Goal**: Transform Knowledge MCP from a personal RAG vault into an enterprise-grade Graph-RAG engine with multi-hop reasoning, blast radius impact analysis, and dependency lineage tracing without introducing heavy external graph DB dependencies.
* **Key Deliverables**:
  - [x] **SQLite Recursive CTE Graph Traversal**: Pure in-database $k$-hop neighbor traversal (`WITH RECURSIVE`) with exponential decay scoring ($\gamma$) and cycle protection via `json_array`/`json_each`.
  - [x] **Zero-Token Graph Extraction**: Rule-based extraction from Markdown `[[wikilinks]]`, cross-document markdown links `[text](./path.md)`, and YAML frontmatter (`depends_on`, `implements`, `supersedes`, `conflicts_with`, `owner`).
  - [x] **Graph Data Schema**: Three indexed tables (`entities`, `edges`, `entity_chunk_map`) keeping strict synchronization with SQLite FTS5 chunk index.
  - [x] **5 New Enterprise MCP Tools (Total 13 Tools)**:
    - `impact_analysis`: Multi-hop blast radius impact analysis.
    - `graph_hybrid_search`: BM25 + Vector + 1-hop graph-expanded search context.
    - `detect_conflicts`: Identifies `CONFLICTS_WITH` relationships across policies and specs.
    - `get_entity_lineage`: Traces full upstream and downstream dependency chains.
    - `find_owner`: Resolves team ownership via `OWNED_BY` edges.
  - [x] **Security & Concurrency Hardening**:
    - In-process file locking (`withFileLock`) preventing race conditions on concurrent note edits.
    - 2-pass batch embedding (`embedBatch`) reducing HTTP round-trips from $N+1$ to 1 per file.
    - Clean modular tool architecture (`src/tools/`).

### 📦 Release v1.0: Core Local-First Hybrid RAG Engine (Done - 2026-08-20)
* **Key Deliverables**:
  - [x] Local SQLite + FTS5 full-text keyword search (BM25).
  - [x] Vector Cosine Similarity search with BLOB storage (`Float32Array`).
  - [x] Reciprocal Rank Fusion (RRF $k=60$) merging keyword + semantic search.
  - [x] Contextual Retrieval with LLM chunk contextualization.
  - [x] MCP Streamable HTTP transport on `/mcp`.

---

## 🚀 Upcoming Roadmap Phases

### ⚡ Phase 1: Real-Time Live File Watcher (Zero-Touch Reindexing)
* **Goal**: Eliminate manual `npm run reindex` commands when users edit notes externally in Obsidian, VS Code, or Notepad.
* **Key Tasks**:
  - [ ] Integrate `chokidar` file watching on `data/raw/` (or configured `VAULT_DIR`).
  - [ ] Debounce file change events (500ms - 1000ms window) to batch rapid keystroke saves.
  - [ ] Trigger selective incremental ingestion (SHA256 diffing) for added, modified, or deleted files.
  - [ ] Broadcast notification events to connected MCP clients if supported.

---

### ✂️ Phase 2: Surgical Note Editing & AST Patching
* **Goal**: Enable AI agents to perform granular, non-destructive updates to specific document sections rather than rewriting whole files.
* **Key Tasks**:
  - [ ] `update_section`: Locate exact Markdown heading path (`H1 > H2 > H3`) and replace/prepend/append text only in that section.
  - [ ] `patch_frontmatter`: Safely update YAML frontmatter metadata (tags, status, author, aliases).
  - [ ] `get_outline`: Return a lightweight hierarchy tree of document headings and token counts.
  - [ ] Automatic atomic rollback if patch validation fails.

---

### 📄 Phase 3: Multi-Format Document Ingestion
* **Goal**: Allow users to drag & drop enterprise documents (PDFs, Word docs, Excel impact matrices) directly into the knowledge vault.
* **Key Tasks**:
  - [ ] PDF Parser integration (`pdf-parse`) with layout and page number tracking.
  - [ ] Word Document Parser (`mammoth`) converting `.docx` structure into clean Markdown.
  - [ ] Excel/CSV Matrix Parser (`xlsx`) converting tabular data into readable Markdown tables.
  - [ ] Automatic media and table extraction.

---

### 🎯 Phase 4: Cross-Encoder Re-Ranking Pipeline
* **Goal**: Polish the top 15 RRF hybrid search results down to the 3–5 most relevant, high-precision context chunks for LLMs.
* **Key Tasks**:
  - [ ] Support local and remote Re-ranker endpoints (e.g. `bge-reranker-large`, Cohere Rerank API, 9router).
  - [ ] Score normalization and threshold filtering.
  - [ ] Dynamic token budget allocator for prompt injection.

---

### 🖥️ Phase 5: Local Web Dashboard & RAG Playground
* **Goal**: Provide a clean, modern local GUI at `http://localhost:3900/ui` for non-CLI management.
* **Key Tasks**:
  - [ ] **Vault Explorer**: Interactive file tree with rich Markdown live preview.
  - [ ] **RAG Playground**: Interactive search bar showing BM25 score, Vector cosine score, RRF rank, and assembled prompt context in real-time.
  - [ ] **Analytics**: Database size, total chunks, token distribution, and latency monitor.
  - [ ] **Drag & Drop Uploader**: Quick web-based file upload to vault.

---

## 🤝 Community & Contributions
We welcome contributions, RFCs, and feature suggestions! If you'd like to collaborate on any of these phases, please check out our [Contributing Guidelines](CONTRIBUTING.md) or open an issue on GitHub.
