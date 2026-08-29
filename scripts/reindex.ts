import { runIngest } from "../src/ingest.js";

async function main() {
  const args = process.argv.slice(2);
  let onlyFile: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && i + 1 < args.length) {
      onlyFile = args[i + 1];
      i++;
    }
  }

  console.log(`[Reindex] Starting index pipeline${onlyFile ? ` for file: ${onlyFile}` : " across entire vault"}...`);
  const startTime = Date.now();

  try {
    const stats = await runIngest({ onlyFile });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Reindex] Completed successfully in ${duration}s.`);
  } catch (error) {
    console.error("[Reindex] Fatal error during indexing:", error);
    process.exit(1);
  }
}

main();
