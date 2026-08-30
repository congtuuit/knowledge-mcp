import fs from "node:fs";

export interface LatencyStats {
  count: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface MemorySnapshot {
  rssMB: number;
  heapTotalMB: number;
  heapUsedMB: number;
  externalMB: number;
}

export function getMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    rssMB: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
    heapTotalMB: Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100,
    heapUsedMB: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
    externalMB: Math.round((mem.external / (1024 * 1024)) * 100) / 100,
  };
}

export function computeLatencyStats(durationsMs: number[]): LatencyStats {
  if (durationsMs.length === 0) {
    return { count: 0, minMs: 0, maxMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 };
  }

  const sorted = [...durationsMs].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  const getPercentile = (p: number): number => {
    const idx = Math.min(count - 1, Math.floor((p / 100) * count));
    return Math.round(sorted[idx] * 100) / 100;
  };

  return {
    count,
    minMs: Math.round(sorted[0] * 100) / 100,
    maxMs: Math.round(sorted[count - 1] * 100) / 100,
    meanMs: Math.round((sum / count) * 100) / 100,
    p50Ms: getPercentile(50),
    p95Ms: getPercentile(95),
    p99Ms: getPercentile(99),
  };
}

export function getFileSizeMB(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  const stat = fs.statSync(filePath);
  return Math.round((stat.size / (1024 * 1024)) * 100) / 100;
}

export function getDirectorySizeBytes(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = `${dirPath}/${entry.name}`;
    if (entry.isDirectory()) {
      total += getDirectorySizeBytes(full);
    } else if (entry.isFile()) {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

/**
 * Ước tính chi phí Token so với các mô hình Cloud LLM (OpenAI GPT-4o-mini / text-embedding-3-small)
 */
export function estimateTokenCost(
  charCount: number,
  mode: "zero_token" | "openai_embedding_only" | "llm_graph_extract"
): { tokens: number; costUsd: number } {
  // Quy ước chuẩn: ~4 ký tự = 1 token
  const baseTokens = Math.ceil(charCount / 4);

  if (mode === "zero_token") {
    return { tokens: 0, costUsd: 0 };
  }

  if (mode === "openai_embedding_only") {
    // $0.02 per 1M tokens (text-embedding-3-small)
    const cost = (baseTokens / 1_000_000) * 0.02;
    return { tokens: baseTokens, costUsd: Math.round(cost * 100000) / 100000 };
  }

  // mode: llm_graph_extract (như Microsoft GraphRAG / Mem0 LLM extract: ~4x prompt + completion per chunk)
  const llmTokens = baseTokens * 4;
  // GPT-4o-mini: $0.15/1M input, $0.60/1M output => avg ~$0.30/1M
  const cost = (llmTokens / 1_000_000) * 0.30;
  return { tokens: llmTokens, costUsd: Math.round(cost * 10000) / 10000 };
}
