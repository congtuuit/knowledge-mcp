import {
  searchFtsChunks,
  getAllChunksWithEmbedding,
  deserializeEmbedding,
  type ChunkRow,
} from "./db.js";
import { embedText } from "./embedder.js";

export interface SearchResult {
  chunkId: string;
  filePath: string;
  headingPath: string | null;
  content: string;
  score: number;
}

export function escapeFts5Query(query: string): string {
  const terms = query
    .trim()
    .replace(/[^\p{L}\p{N}\s_]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return "";
  }

  // Join with OR so BM25 ranks documents matching more terms higher
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(" OR ");
}

function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function keywordSearch(query: string, k: number = 8): Promise<SearchResult[]> {
  const escaped = escapeFts5Query(query);
  if (!escaped) {
    return [];
  }

  try {
    const rows = searchFtsChunks(escaped, 30);
    return rows.slice(0, k).map((r) => ({
      chunkId: r.id,
      filePath: r.file_path,
      headingPath: r.heading_path,
      content: r.content,
      score: r.score,
    }));
  } catch (error) {
    console.warn("[Search] Keyword search failed:", error);
    return [];
  }
}

export async function vectorSearch(query: string, k: number = 8): Promise<SearchResult[]> {
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) {
    return [];
  }

  const allChunks = getAllChunksWithEmbedding();
  if (allChunks.length === 0) {
    return [];
  }

  const scored = allChunks.map((chunk) => {
    const vec = deserializeEmbedding(chunk.embedding!);
    const score = cosineSimilarity(queryEmbedding, vec);
    return {
      chunkId: chunk.id,
      filePath: chunk.file_path,
      headingPath: chunk.heading_path,
      content: chunk.content,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export async function hybridSearch(query: string, k: number = 8): Promise<SearchResult[]> {
  const K_RRF = 60;
  const [keywordResults, vectorResults] = await Promise.all([
    keywordSearch(query, 30),
    vectorSearch(query, 30),
  ]);

  const scoreMap = new Map<
    string,
    {
      chunkId: string;
      filePath: string;
      headingPath: string | null;
      content: string;
      rrfScore: number;
    }
  >();

  // Keyword ranks
  for (let rank = 0; rank < keywordResults.length; rank++) {
    const item = keywordResults[rank];
    const rrf = 1 / (K_RRF + rank + 1);
    const existing = scoreMap.get(item.chunkId);
    if (existing) {
      existing.rrfScore += rrf;
    } else {
      scoreMap.set(item.chunkId, {
        chunkId: item.chunkId,
        filePath: item.filePath,
        headingPath: item.headingPath,
        content: item.content,
        rrfScore: rrf,
      });
    }
  }

  // Vector ranks
  for (let rank = 0; rank < vectorResults.length; rank++) {
    const item = vectorResults[rank];
    const rrf = 1 / (K_RRF + rank + 1);
    const existing = scoreMap.get(item.chunkId);
    if (existing) {
      existing.rrfScore += rrf;
    } else {
      scoreMap.set(item.chunkId, {
        chunkId: item.chunkId,
        filePath: item.filePath,
        headingPath: item.headingPath,
        content: item.content,
        rrfScore: rrf,
      });
    }
  }

  const combined = Array.from(scoreMap.values());
  combined.sort((a, b) => b.rrfScore - a.rrfScore);

  return combined.slice(0, k).map((item) => ({
    chunkId: item.chunkId,
    filePath: item.filePath,
    headingPath: item.headingPath,
    content: item.content,
    score: item.rrfScore,
  }));
}
