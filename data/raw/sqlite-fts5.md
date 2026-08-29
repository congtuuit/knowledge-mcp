---
title: SQLite and FTS5 Full Text Search
tags: [sqlite, fts5, bm25, full-text-search, wal-mode]
category: Database & Indexing Engines
---

# SQLite and FTS5 Full Text Search

SQLite is an embedded, in-process C-language library that implements a self-contained, serverless, zero-configuration, transactional SQL database engine.

---

## 1. Overview of SQLite

SQLite is the most widely deployed database engine globally, built into smartphones, operating systems, browsers, and embedded hardware.

---

## 2. FTS5 Virtual Table Module

**FTS5 (Full-Text Search 5)** is an SQLite extension module designed specifically for fast, efficient text search:
* Supports tokenized text indexing.
* Evaluates boolean queries (`AND`, `OR`, `NOT`) and prefix queries.
* Implements **BM25 ranking** natively to sort matching records by relevance.

---

## 3. Concurrency & Performance (WAL Mode)

Enabling **WAL mode (Write-Ahead Logging)** via `PRAGMA journal_mode = WAL;` drastically improves concurrency by allowing multiple reader connections to query the database concurrently with a writer process.
