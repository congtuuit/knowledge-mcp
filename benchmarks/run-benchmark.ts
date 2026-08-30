import fs from "node:fs";
import path from "node:path";
import { generateSyntheticVault } from "./generators/synthetic-vault-generator.js";
import { convertStandardDatasetToVault } from "./generators/hf-dataset-loader.js";
import { runFullBenchmark } from "./runners/benchmark-engine.js";
import { generateMarkdownReport } from "./evaluators/report-generator.js";

async function main() {
  console.log("==================================================================");
  console.log("🚀 STARTING KNOWLEDGE MCP BENCHMARK PIPELINE");
  console.log("==================================================================");

  const scaleArg = (process.argv.find((a) => a.startsWith("--scale="))?.split("=")[1] ?? "standard") as
    | "micro"
    | "standard"
    | "enterprise";

  const sizeArg = process.argv.find((a) => a.startsWith("--size="))?.split("=")[1];
  const datasetArg = process.argv.find((a) => a.startsWith("--dataset="))?.split("=")[1] ?? "synthetic";

  const vaultDir = path.resolve(datasetArg === "standard" ? "./data/standard-vault" : "./data/synthetic-vault");
  const groundTruthPath = path.resolve(
    datasetArg === "standard"
      ? "./benchmarks/datasets/standard_ground_truth.json"
      : "./benchmarks/datasets/synthetic_ground_truth.json"
  );
  const dbPath = path.resolve("./db/knowledge_benchmark.db");
  const reportPath = path.resolve("./BENCHMARK_REPORT.md");

  // 1. Sinh Dataset
  if (datasetArg === "standard") {
    console.log(`\n[1/3] 📦 Loading Official Standard Multi-Hop Dataset (HotpotQA format)...`);
    const genStats = convertStandardDatasetToVault({
      outputVaultDir: vaultDir,
      groundTruthFile: groundTruthPath,
    });
    console.log(`[1/3] ✅ Converted ${genStats.totalFiles} standard notes and ${genStats.groundTruthCount} QA ground truth items.`);
  } else {
    console.log(`\n[1/3] 📦 Generating Scalable Enterprise Knowledge Vault & Ground Truth (Scale: ${scaleArg.toUpperCase()})...`);
    const genStats = generateSyntheticVault({
      outputDir: vaultDir,
      groundTruthFile: groundTruthPath,
      scale: scaleArg,
      targetFileCount: sizeArg ? parseInt(sizeArg, 10) : undefined,
    });
    console.log(`[1/3] ✅ Generated ${genStats.totalFiles} files and ${genStats.groundTruthCount} ground truth benchmark items.`);
  }

  // 2. Chạy Benchmark Suite
  console.log("\n[2/3] 🧪 Running Benchmark Evaluations across all Dimensions...");
  const reportData = await runFullBenchmark({
    vaultDir,
    groundTruthPath,
    dbPath,
  });

  // 3. Xuất Báo Cáo Markdown
  console.log("\n[3/3] 📄 Generating Comprehensive Benchmark Markdown Report...");
  const markdownReport = generateMarkdownReport(reportData);
  fs.writeFileSync(reportPath, markdownReport, "utf8");

  console.log(`[3/3] ✅ Report saved successfully to: ${reportPath}`);

  // In bảng tóm tắt ra console
  console.log("\n==================================================================");
  console.log("📊 BENCHMARK EXECUTIVE SUMMARY");
  console.log("==================================================================");
  console.log(`📦 Dataset Scope:        ${reportData.ingestion.totalFiles} files | ${reportData.ingestion.totalChunks} chunks`);
  console.log(`⚡ Ingestion Speed:      ${reportData.ingestion.throughputChunksPerSec} chunks/sec`);
  console.log(`⚡ Cold Reindex Time:    ${reportData.ingestion.coldIngestDurationMs} ms`);
  console.log(`⚡ Incremental Diff:     ${reportData.ingestion.incrementalIngestDurationMs} ms`);
  console.log(`💰 Token Cost (Graph):   $0.00 (Zero-Token extraction)`);
  console.log(`🧠 Peak RAM:             ${reportData.ingestion.memoryPeakSnapshot.rssMB} MB`);
  console.log(`🕸️ Multi-Hop Match:      ${(reportData.graphMetrics.multiHopPathAccuracy.exactMatchRate * 100).toFixed(1)}%`);
  console.log(`🕸️ Blast Radius F1:      ${(reportData.graphMetrics.blastRadiusF1.f1 * 100).toFixed(1)}%`);
  console.log(`🕸️ Graph Query Latency:  ${reportData.graphMetrics.graphLatency.p50Ms} ms (p50)`);

  const hybridMode = reportData.retrievalModes.find((m) => m.modeName.includes("Hybrid"));
  if (hybridMode) {
    console.log(`🎯 Hybrid HitRate@1:     ${(hybridMode.overallMetrics.hitRateAt1 * 100).toFixed(1)}%`);
    console.log(`🎯 Hybrid MRR:           ${hybridMode.overallMetrics.mrr.toFixed(3)}`);
    console.log(`🎯 Hybrid Latency (p50): ${hybridMode.latency.p50Ms} ms`);
  }

  console.log("==================================================================");
  console.log("✨ All benchmarks completed successfully!");
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("❌ Benchmark failed:", err);
  process.exit(1);
});
