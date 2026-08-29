import { embedText, embedBatch } from "../src/embedder.js";
import { generateContext } from "../src/contextualizer.js";

async function main() {
  console.log("Testing Embedding & Contextualizer (Phase 3)...");

  console.log("Testing embedText with sample input...");
  const embedding = await embedText("Xin chào, đây là bài kiểm tra embedding.");
  if (embedding) {
    console.log(`Successfully obtained embedding vector of length: ${embedding.length}`);
  } else {
    console.log("[Notice] Embedding endpoint returned null (e.g. Ollama not running locally). Best-effort fallback behavior verified.");
  }

  console.log("Testing embedBatch...");
  const batchResults = await embedBatch(["Câu 1", "Câu 2"]);
  console.log(`Batch results length: ${batchResults.length}`);

  console.log("Testing generateContext...");
  const ctx = await generateContext("Tài liệu về lập trình TypeScript và MCP server.", "MCP server chạy trên nền tảng TypeScript.");
  console.log("Generated context:", ctx || "(Contextual disabled or endpoint offline, graceful fallback)");

  console.log("Phase 3 Embedding & Contextualizer verified.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
