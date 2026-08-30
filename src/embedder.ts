import { config } from "./config.js";

export function generateDeterministicEmbedding(text: string, dim: number = 768): number[] {
  const vec = new Float32Array(dim);
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s_]/gu, " ").split(/\s+/);
  for (const word of words) {
    if (!word) continue;
    let h = 5381;
    for (let i = 0; i < word.length; i++) {
      h = ((h << 5) + h + word.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(h) % dim;
    vec[idx] += 1.0;
  }
  // Normalize to unit vector
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vec[i] /= norm;
    }
  }
  return Array.from(vec);
}

let endpointAvailable = true;
let lastFailureTimestamp = 0;
const RETRY_INTERVAL_MS = 30000;

export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  // Circuit breaker: nếu endpoint vừa fail gần đây, dùng ngay deterministic embedding
  if (!endpointAvailable && Date.now() - lastFailureTimestamp < RETRY_INTERVAL_MS) {
    return generateDeterministicEmbedding(trimmed, config.embedding.dim);
  }

  const endpoint = `${config.embedding.baseUrl.replace(/\/+$/, "")}/embeddings`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.embedding.apiKey}`,
      },
      body: JSON.stringify({
        model: config.embedding.model,
        input: trimmed,
      }),
      signal: AbortSignal.timeout(1000),
    });

    if (!res.ok) {
      endpointAvailable = false;
      lastFailureTimestamp = Date.now();
      return generateDeterministicEmbedding(trimmed, config.embedding.dim);
    }

    const data = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };

    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      endpointAvailable = false;
      lastFailureTimestamp = Date.now();
      return generateDeterministicEmbedding(trimmed, config.embedding.dim);
    }

    endpointAvailable = true;
    return data.data[0].embedding;
  } catch {
    // Trip circuit breaker on network error / timeout
    endpointAvailable = false;
    lastFailureTimestamp = Date.now();
    return generateDeterministicEmbedding(trimmed, config.embedding.dim);
  }
}

export async function embedBatch(texts: string[], batchSize: number = 10): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchTexts = texts.slice(i, i + batchSize);
    const batchPromises = batchTexts.map((txt) => embedText(txt));
    const batchResults = await Promise.all(batchPromises);

    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
}
