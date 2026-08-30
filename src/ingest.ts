import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import {
  getDb,
  upsertFile,
  getFileByPath,
  getAllFiles,
  deleteFile,
  getChunksByFile,
  insertChunk,
  deleteChunk,
  upsertEntity,
  upsertEdge,
  deleteEntitiesByFile,
  linkEntityToChunk,
  type ChunkRow,
} from "./db.js";
import { chunkMarkdown, chunkPlainText } from "./chunker.js";
import { generateContext } from "./contextualizer.js";
import { embedBatch } from "./embedder.js";
import { extractGraph } from "./graph-extractor.js";

export interface IngestOptions {
  onlyFile?: string;
}

export interface IngestStats {
  filesNew: number;
  filesUpdated: number;
  filesUnchanged: number;
  filesDeleted: number;
  chunksNew: number;
  chunksKept: number;
  chunksDeleted: number;
}

export function computeSha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function getAllSupportedFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllSupportedFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".md" || ext === ".txt") {
        results.push(fullPath);
      }
    }
  }

  return results;
}

export async function runIngest(options?: IngestOptions): Promise<IngestStats> {
  // Ensure DB is initialized
  getDb();

  const stats: IngestStats = {
    filesNew: 0,
    filesUpdated: 0,
    filesUnchanged: 0,
    filesDeleted: 0,
    chunksNew: 0,
    chunksKept: 0,
    chunksDeleted: 0,
  };

  const vaultDir = config.vaultDir;
  if (!fs.existsSync(vaultDir)) {
    fs.mkdirSync(vaultDir, { recursive: true });
  }

  let filesToProcess: string[] = [];

  if (options?.onlyFile) {
    const targetPath = path.isAbsolute(options.onlyFile)
      ? options.onlyFile
      : path.resolve(vaultDir, options.onlyFile);

    if (fs.existsSync(targetPath)) {
      filesToProcess = [targetPath];
    } else {
      console.warn(`[Ingest] Specified file not found: ${targetPath}`);
      return stats;
    }
  } else {
    filesToProcess = getAllSupportedFiles(vaultDir);
  }

  const processedRelativePaths = new Set<string>();

  for (const fullPath of filesToProcess) {
    const relPath = path.relative(vaultDir, fullPath).replace(/\\/g, "/");
    processedRelativePaths.add(relPath);

    const fileContent = fs.readFileSync(fullPath, "utf-8");
    const stat = fs.statSync(fullPath);
    const fileHash = computeSha256(fileContent);

    const existingFile = getFileByPath(relPath);

    if (existingFile && existingFile.file_hash === fileHash) {
      stats.filesUnchanged++;
      const existingChunks = getChunksByFile(existingFile.id);
      stats.chunksKept += existingChunks.length;
      continue;
    }

    const isNewFile = !existingFile;
    if (isNewFile) {
      stats.filesNew++;
    } else {
      stats.filesUpdated++;
    }

    const fileId = upsertFile(relPath, fileHash, Math.floor(stat.mtimeMs));

    // Chunking
    const ext = path.extname(relPath).toLowerCase();
    const parsedChunks = ext === ".md" ? chunkMarkdown(fileContent).chunks : chunkPlainText(fileContent);

    const oldChunks = isNewFile ? [] : getChunksByFile(fileId);
    const oldChunksByHash = new Map<string, ChunkRow>();
    for (const oc of oldChunks) {
      oldChunksByHash.set(oc.content_hash, oc);
    }

    // -------------------------------------------------------
    // Two-pass batch embedding (Fix: N+1 → 1 batch per file)
    // -------------------------------------------------------
    const currentChunkHashes = new Set<string>();

    // Pass 1: identify new chunks, run contextualization
    type PendingChunk = {
      chunk: (typeof parsedChunks)[number];
      chunkIndex: number;
      contentHash: string;
      contextualizedContent: string;
    };

    const pendingNew: PendingChunk[] = [];

    for (let i = 0; i < parsedChunks.length; i++) {
      const chunk = parsedChunks[i];
      const contentHash = computeSha256(chunk.content);
      currentChunkHashes.add(contentHash);

      if (oldChunksByHash.has(contentHash)) {
        stats.chunksKept++;
        continue;
      }

      stats.chunksNew++;

      // Contextualize (still per-chunk; LLM call is the bottleneck, not a hot path)
      let contextualizedContent = chunk.content;
      if (config.contextual.enabled) {
        const context = await generateContext(fileContent, chunk.content);
        if (context) contextualizedContent = `${context}\n\n${chunk.content}`;
      }

      pendingNew.push({ chunk, chunkIndex: i, contentHash, contextualizedContent });
    }

    // Pass 2: batch embed all new chunks in one HTTP round-trip burst
    if (pendingNew.length > 0) {
      const texts = pendingNew.map((p) => p.contextualizedContent);
      const embeddings = await embedBatch(texts, 10); // batchSize=10

      // Wrap chunk inserts + graph extraction in a single transaction per file
      // for significantly reduced SQLite WAL overhead.
      // node:sqlite's DatabaseSync does not have .transaction() — use SAVEPOINT instead.
      const db = getDb();
      const savepointName = `sp_ingest_${Date.now()}`;
      db.exec(`SAVEPOINT "${savepointName}";`);
      let batchOk = false;
      try {
        for (let j = 0; j < pendingNew.length; j++) {
          const { chunk, chunkIndex, contentHash, contextualizedContent } = pendingNew[j];
          const embedding = embeddings[j];

          if (!embedding) {
            console.warn(
              `[Ingest] No embedding for chunk ${chunkIndex} of '${relPath}' ` +
              `(embedding gateway unavailable?)`
            );
          }

          insertChunk({
            fileId,
            chunkIndex,
            headingPath: chunk.headingPath,
            content: chunk.content,
            contextualizedContent,
            contentHash,
            embedding,
            embeddingModel: embedding ? config.embedding.model : null,
          });
        }

        // Graph extraction also runs inside the same savepoint
        if (ext === ".md") {
          try {
            const parsed = chunkMarkdown(fileContent);
            const graphData = extractGraph(relPath, parsed.frontmatter, fileContent);

            deleteEntitiesByFile(fileId);

            const entityId = upsertEntity({
              name: graphData.entity.name,
              type: graphData.entity.type,
              fileId,
              source: graphData.entity.source,
              metadata: Object.keys(graphData.entity.metadata).length > 0
                ? graphData.entity.metadata
                : null,
            });

            const fileChunks = getChunksByFile(fileId);
            for (const chunk of fileChunks) {
              linkEntityToChunk(entityId, chunk.id);
            }

            for (const edge of graphData.edges) {
              const targetEntityId = upsertEntity({
                name: edge.targetName,
                type: "document",
                fileId: null,
                source: "auto_link",
                metadata: null,
              });

              upsertEdge({
                sourceId: entityId,
                targetId: targetEntityId,
                edgeType: edge.edgeType,
                weight: edge.weight,
                confidence: edge.confidence,
                sourceType: edge.sourceType,
              });
            }
          } catch (err) {
            console.warn(`[Ingest] Graph extraction failed for ${relPath}:`, err);
          }
        }
        batchOk = true;
      } finally {
        if (batchOk) {
          db.exec(`RELEASE "${savepointName}";`);
        } else {
          db.exec(`ROLLBACK TO "${savepointName}";`);
          db.exec(`RELEASE "${savepointName}";`);
        }
      }
    }

    // Delete chunks that no longer exist in the new version
    for (const oldChunk of oldChunks) {
      if (!currentChunkHashes.has(oldChunk.content_hash)) {
        deleteChunk(oldChunk.id);
        stats.chunksDeleted++;
      }
    }
  } // end of filesToProcess loop

  // Prune deleted files if scanning entire vault
  if (!options?.onlyFile) {
    const allDbFiles = getAllFiles();
    for (const dbFile of allDbFiles) {
      const diskPath = path.join(vaultDir, dbFile.path);
      if (!fs.existsSync(diskPath)) {
        deleteFile(dbFile.id);
        stats.filesDeleted++;
      }
    }
  }

  console.log("\n========== Ingest Summary ==========");
  console.log(`Files  : +${stats.filesNew} new, ~${stats.filesUpdated} updated, =${stats.filesUnchanged} unchanged, -${stats.filesDeleted} deleted`);
  console.log(`Chunks : +${stats.chunksNew} embedded, =${stats.chunksKept} kept, -${stats.chunksDeleted} removed`);
  console.log("====================================\n");

  return stats;
}
