import { getDb, upsertFile, insertChunk, searchFtsChunks, getChunksByFile, deleteFile } from "../src/db.js";

async function main() {
  console.log("Testing Database Layer (Phase 1)...");

  // Ensure DB initialized
  const db = getDb();
  console.log("DB initialized successfully.");

  // Insert mock file
  const testPath = "test/doc.md";
  const fileHash = "hash123456789";
  const mtime = Date.now();
  const fileId = upsertFile(testPath, fileHash, mtime);
  console.log(`Upserted test file with ID: ${fileId}`);

  const uniqueToken = "AntigravityUniqueToken999";

  // Insert mock chunk
  const chunkId = insertChunk({
    fileId,
    chunkIndex: 0,
    headingPath: "Introduction > Overview",
    content: `This is a test chunk containing special knowledge about ${uniqueToken} and SQLite.`,
    contextualizedContent: `Document discusses ${uniqueToken}. This is a test chunk containing special knowledge about ${uniqueToken} and SQLite.`,
    contentHash: "chunkhash123",
    embedding: [0.1, 0.2, 0.3, 0.4],
    embeddingModel: "test-model",
  });
  console.log(`Inserted chunk with ID: ${chunkId}`);

  // Verify chunk in DB
  const chunks = getChunksByFile(fileId);
  console.log(`Found ${chunks.length} chunk(s) for file.`);
  if (chunks.length === 0 || !chunks[0].content.includes(uniqueToken)) {
    throw new Error("Failed to retrieve inserted chunk!");
  }

  // Verify FTS5 query
  const ftsResults = searchFtsChunks(`"${uniqueToken}"`, 5);
  console.log(`FTS5 search for '${uniqueToken}' returned ${ftsResults.length} result(s).`);
  if (ftsResults.length === 0) {
    throw new Error("FTS5 match returned 0 results! Trigger might not be working.");
  }
  console.log("FTS5 matched chunk content:", ftsResults[0].content);

  // Clean up test file
  deleteFile(fileId);
  console.log("Deleted test file (cascade delete chunk).");

  const chunksAfterDelete = getChunksByFile(fileId);
  if (chunksAfterDelete.length !== 0) {
    throw new Error("Cascade delete failed: chunk still exists!");
  }

  const ftsAfterDelete = searchFtsChunks(`"${uniqueToken}"`, 5);
  if (ftsAfterDelete.length !== 0) {
    throw new Error("FTS5 delete trigger failed: chunk still in FTS5 table!");
  }


  console.log("Phase 1 DB Test PASSED successfully! All constraints and triggers verified.");
}

main().catch((err) => {
  console.error("DB Test Failed:", err);
  process.exit(1);
});
