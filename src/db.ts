import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";

export interface FileRow {
  id: string;
  path: string;
  file_hash: string;
  mtime: number;
  updated_at: number;
}

export interface ChunkRow {
  id: string;
  file_id: string;
  chunk_index: number;
  heading_path: string | null;
  content: string;
  contextualized_content: string | null;
  content_hash: string;
  embedding: Uint8Array | Buffer | null;
  embedding_model: string | null;
  created_at: number;
  rowid?: number;
  file_path?: string;
}

export type EntityType = "document" | "service" | "api" | "schema" | "team" | "concept";
export type EntitySource = "auto_link" | "frontmatter" | "llm_extract" | "manual";
export type EdgeType =
  | "DEPENDS_ON"
  | "REFERENCES"
  | "IMPLEMENTS"
  | "SUPERSEDES"
  | "OWNED_BY"
  | "CONFLICTS_WITH";
export type EdgeSourceType = "wikilink" | "frontmatter" | "openapi" | "llm" | "manual";

export interface EntityRow {
  id: string;
  name: string;
  type: EntityType;
  file_id: string | null;
  source: EntitySource;
  metadata: string | null; // JSON string
  created_at: number;
}

export interface EdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: EdgeType;
  weight: number;
  confidence: number;
  source_type: EdgeSourceType;
  created_at: number;
}

export interface EntityWithScore extends EntityRow {
  file_path: string | null;
  influence_score: number;
  min_depth: number;
}

export interface InsertChunkInput {
  id?: string;
  fileId: string;
  chunkIndex: number;
  headingPath?: string | null;
  content: string;
  contextualizedContent?: string | null;
  contentHash: string;
  embedding?: number[] | null;
  embeddingModel?: string | null;
}

let dbInstance: DatabaseSync | null = null;

export function serializeEmbedding(vec: number[] | Float32Array): Uint8Array {
  const floatArray = vec instanceof Float32Array ? vec : Float32Array.from(vec);
  return new Uint8Array(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);
}

export function deserializeEmbedding(buf: Uint8Array | Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

export function getDb(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      file_hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      heading_path TEXT,
      content TEXT NOT NULL,
      contextualized_content TEXT,
      content_hash TEXT NOT NULL,
      embedding BLOB,
      embedding_model TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(content_hash);

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

    -- ==========================================
    -- Graph Layer: Entities, Edges, Mapping
    -- ==========================================

    CREATE TABLE IF NOT EXISTS entities (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'document',
      file_id    TEXT REFERENCES files(id) ON DELETE CASCADE,
      source     TEXT NOT NULL DEFAULT 'auto_link',
      metadata   TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_entities_file ON entities(file_id);
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

    CREATE TABLE IF NOT EXISTS edges (
      id          TEXT PRIMARY KEY,
      source_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      target_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      edge_type   TEXT NOT NULL,
      weight      REAL NOT NULL DEFAULT 1.0,
      confidence  REAL NOT NULL DEFAULT 1.0,
      source_type TEXT NOT NULL DEFAULT 'frontmatter',
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id, edge_type);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id, edge_type);
    CREATE INDEX IF NOT EXISTS idx_edges_type   ON edges(edge_type);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique ON edges(source_id, target_id, edge_type);

    CREATE TABLE IF NOT EXISTS entity_chunk_map (
      entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      chunk_id   TEXT NOT NULL REFERENCES chunks(id)   ON DELETE CASCADE,
      PRIMARY KEY (entity_id, chunk_id)
    );
  `);

  dbInstance = db;
  return dbInstance;
}

export function upsertFile(filePath: string, fileHash: string, mtime: number): string {
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare("SELECT id FROM files WHERE path = ?").get(filePath) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE files
      SET file_hash = ?, mtime = ?, updated_at = ?
      WHERE id = ?
    `).run(fileHash, mtime, now, existing.id);
    return existing.id;
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO files (id, path, file_hash, mtime, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, filePath, fileHash, mtime, now);
    return id;
  }
}

export function getFileByPath(filePath: string): FileRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM files WHERE path = ?").get(filePath) as unknown as FileRow | undefined;
}

export function getAllFiles(): FileRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM files").all() as unknown as FileRow[];
}

export function deleteFile(fileId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM files WHERE id = ?").run(fileId);
}

export function getChunksByFile(fileId: string): ChunkRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM chunks WHERE file_id = ? ORDER BY chunk_index ASC").all(fileId) as unknown as ChunkRow[];
}

export function insertChunk(input: InsertChunkInput): string {
  const db = getDb();
  const id = input.id ?? uuidv4();
  const embeddingBlob = input.embedding ? serializeEmbedding(input.embedding) : null;
  const now = Date.now();

  db.prepare(`
    INSERT INTO chunks (
      id, file_id, chunk_index, heading_path,
      content, contextualized_content, content_hash,
      embedding, embedding_model, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.fileId,
    input.chunkIndex,
    input.headingPath ?? null,
    input.content,
    input.contextualizedContent ?? null,
    input.contentHash,
    embeddingBlob,
    input.embeddingModel ?? null,
    now
  );

  return id;
}

export function deleteChunk(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM chunks WHERE id = ?").run(id);
}

export function getAllChunksWithEmbedding(): (ChunkRow & { file_path: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      c.id, c.file_id, c.chunk_index, c.heading_path,
      c.content, c.contextualized_content, c.content_hash,
      c.embedding, c.embedding_model, c.created_at,
      f.path as file_path
    FROM chunks c
    JOIN files f ON c.file_id = f.id
    WHERE c.embedding IS NOT NULL
  `).all() as unknown as (ChunkRow & { file_path: string })[];
}

export function searchFtsChunks(escapedQuery: string, limit: number = 30): (ChunkRow & { file_path: string; score: number })[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      c.id, c.file_id, c.chunk_index, c.heading_path,
      c.content, c.contextualized_content, c.content_hash,
      c.embedding, c.embedding_model, c.created_at,
      f.path as file_path,
      bm25(chunks_fts) as score
    FROM chunks_fts
    JOIN chunks c ON c.rowid = chunks_fts.rowid
    JOIN files f ON c.file_id = f.id
    WHERE chunks_fts MATCH ?
    ORDER BY score ASC
    LIMIT ?
  `).all(escapedQuery, limit) as unknown as (ChunkRow & { file_path: string; score: number })[];
}

// ==========================================
// Graph CRUD Functions
// ==========================================

export function upsertEntity(params: {
  name: string;
  type: EntityType;
  fileId?: string | null;
  source: EntitySource;
  metadata?: Record<string, unknown> | null;
}): string {
  const db = getDb();
  const now = Date.now();
  const metaJson = params.metadata ? JSON.stringify(params.metadata) : null;

  // Upsert by (name, type) — treat as unique identity
  const existing = db
    .prepare("SELECT id FROM entities WHERE name = ? COLLATE NOCASE AND type = ?")
    .get(params.name, params.type) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE entities SET file_id = ?, source = ?, metadata = ? WHERE id = ?"
    ).run(params.fileId ?? null, params.source, metaJson, existing.id);
    return existing.id;
  }

  const id = uuidv4();
  db.prepare(
    "INSERT INTO entities (id, name, type, file_id, source, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, params.name, params.type, params.fileId ?? null, params.source, metaJson, now);
  return id;
}

export function getEntityByName(name: string, type?: EntityType): EntityRow | undefined {
  const db = getDb();
  if (type) {
    return db
      .prepare("SELECT * FROM entities WHERE name = ? COLLATE NOCASE AND type = ?")
      .get(name, type) as unknown as EntityRow | undefined;
  }
  return db
    .prepare("SELECT * FROM entities WHERE name = ? COLLATE NOCASE LIMIT 1")
    .get(name) as unknown as EntityRow | undefined;
}

export function getEntityById(id: string): EntityRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as unknown as EntityRow | undefined;
}

export function searchEntitiesByName(nameLike: string, limit = 10): EntityRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM entities WHERE name LIKE ? LIMIT ?")
    .all(`%${nameLike}%`, limit) as unknown as EntityRow[];
}

export function upsertEdge(params: {
  sourceId: string;
  targetId: string;
  edgeType: EdgeType;
  weight?: number;
  confidence?: number;
  sourceType: EdgeSourceType;
}): string {
  const db = getDb();
  const now = Date.now();

  const existing = db
    .prepare(
      "SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND edge_type = ?"
    )
    .get(params.sourceId, params.targetId, params.edgeType) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE edges SET weight = ?, confidence = ?, source_type = ? WHERE id = ?"
    ).run(params.weight ?? 1.0, params.confidence ?? 1.0, params.sourceType, existing.id);
    return existing.id;
  }

  const id = uuidv4();
  db.prepare(
    "INSERT INTO edges (id, source_id, target_id, edge_type, weight, confidence, source_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, params.sourceId, params.targetId, params.edgeType,
    params.weight ?? 1.0, params.confidence ?? 1.0, params.sourceType, now
  );
  return id;
}

export function deleteEntitiesByFile(fileId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM entities WHERE file_id = ?").run(fileId);
}

export function linkEntityToChunk(entityId: string, chunkId: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO entity_chunk_map (entity_id, chunk_id) VALUES (?, ?)"
  ).run(entityId, chunkId);
}

export function getEntityCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as c FROM entities").get() as { c: number };
  return row.c;
}

export function getEdgeCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as c FROM edges").get() as { c: number };
  return row.c;
}
