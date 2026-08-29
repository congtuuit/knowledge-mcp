import { config } from "./config.js";

export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
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
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[Embedder] HTTP ${res.status} from ${endpoint}: ${errBody}`);
      return null;
    }

    const data = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };

    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      console.warn("[Embedder] Invalid response format from embedding endpoint:", data);
      return null;
    }

    return data.data[0].embedding;
  } catch (error) {
    console.warn(`[Embedder] Failed to embed chunk (length: ${trimmed.length}):`, error);
    return null;
  }
}

export async function embedBatch(texts: string[], batchSize: number = 5): Promise<(number[] | null)[]> {
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
