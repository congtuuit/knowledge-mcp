import { hybridSearch, keywordSearch } from "../src/search.js";

async function main() {
  console.log("Testing Search Engine (Phase 5)...");

  // Query 1: Exact keyword search
  console.log("\n--- Query 1: 'WAL mode concurrency' (FTS5 exact keywords) ---");
  const q1Results = await hybridSearch("WAL mode concurrency", 3);
  console.log(`Returned ${q1Results.length} result(s):`);
  for (const r of q1Results) {
    console.log(`[Score: ${r.score.toFixed(4)}] [${r.filePath}] ${r.headingPath ?? "root"}: ${r.content.slice(0, 80)}...`);
  }

  if (q1Results.length === 0 || !q1Results[0].filePath.includes("sqlite-fts5.md")) {
    throw new Error("Query 1 failed to rank sqlite-fts5.md in top results!");
  }

  // Query 2: TypeScript strict
  console.log("\n--- Query 2: 'tsconfig strict mode' ---");
  const q2Results = await hybridSearch("tsconfig strict mode", 3);
  console.log(`Returned ${q2Results.length} result(s):`);
  for (const r of q2Results) {
    console.log(`[Score: ${r.score.toFixed(4)}] [${r.filePath}] ${r.headingPath ?? "root"}: ${r.content.slice(0, 80)}...`);
  }

  if (q2Results.length === 0 || !q2Results[0].filePath.includes("typescript-guide.md")) {
    throw new Error("Query 2 failed to rank typescript-guide.md in top results!");
  }

  // Query 3: MCP tools & security
  console.log("\n--- Query 3: 'Streamable HTTP Bearer Authorization' ---");
  const q3Results = await hybridSearch("Streamable HTTP Bearer Authorization", 3);
  console.log(`Returned ${q3Results.length} result(s):`);
  for (const r of q3Results) {
    console.log(`[Score: ${r.score.toFixed(4)}] [${r.filePath}] ${r.headingPath ?? "root"}: ${r.content.slice(0, 80)}...`);
  }

  if (q3Results.length === 0 || !q3Results[0].filePath.includes("mcp-architecture.md")) {
    throw new Error("Query 3 failed to rank mcp-architecture.md in top results!");
  }

  console.log("\nPhase 5 Search Engine Test PASSED successfully!");
}

main().catch((err) => {
  console.error("Search Test Failed:", err);
  process.exit(1);
});
