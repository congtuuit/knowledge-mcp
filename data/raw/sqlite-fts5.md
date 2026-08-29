# SQLite and FTS5 Full Text Search

SQLite is a C-language library that implements a small, fast, self-contained, high-reliability, full-featured SQL database engine.

## Overview of SQLite

SQLite is the most used database engine in the world. It is built into all mobile phones and most computers and comes bundled inside countless other applications.

## FTS5 Extension

FTS5 is an SQLite virtual table module that provides full-text search capability. It allows users to search documents using boolean queries, prefix queries, and BM25 ranking.

## Performance Considerations

SQLite WAL mode (Write-Ahead Logging) significantly improves concurrency by allowing multiple readers to access the database concurrently with a writer.
