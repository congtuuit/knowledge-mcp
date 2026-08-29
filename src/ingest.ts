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
  type ChunkRow,
} from "./db.js";
import { chunkMarkdown, chunkPlainText } from "./chunker.js";
import { generateContext } from "./contextualizer.js";
import { embedText } from "./embedder.js";

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

    const currentChunkHashes = new Set<string>();

    for (let i = 0; i < parsedChunks.length; i++) {
      const chunk = parsedChunks[i];
      const contentHash = computeSha256(chunk.content);
      currentChunkHashes.add(contentHash);

      const existingChunk = oldChunksByHash.get(contentHash);

      if (existingChunk) {
        // Chunk content unchanged, reuse existing record
        stats.chunksKept++;
      } else {
        // New or modified chunk
        stats.chunksNew++;

        let contextualizedContent = chunk.content;
        if (config.contextual.enabled) {
          const context = await generateContext(fileContent, chunk.content);
          if (context) {
            contextualizedContent = `${context}\n\n${chunk.content}`;
          }
        }

        const embedding = await embedText(contextualizedContent);

        insertChunk({
          fileId,
          chunkIndex: i,
          headingPath: chunk.headingPath,
          content: chunk.content,
          contextualizedContent,
          contentHash,
          embedding,
          embeddingModel: embedding ? config.embedding.model : null,
        });
      }
    }

    // Delete chunks that no longer exist in the new version
    for (const oldChunk of oldChunks) {
      if (!currentChunkHashes.has(oldChunk.content_hash)) {
        deleteChunk(oldChunk.id);
        stats.chunksDeleted++;
      }
    }
  }

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
