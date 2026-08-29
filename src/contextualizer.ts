import { config } from "./config.js";

const SYSTEM_PROMPT = `Bạn sẽ được cho toàn bộ tài liệu, và một đoạn trích (chunk) cụ thể từ tài liệu đó.
Hãy viết 1-2 câu ngắn gọn (tiếng Việt) mô tả đoạn trích này nằm trong ngữ cảnh nào của tài liệu, để giúp cải thiện việc tìm kiếm đoạn trích này sau này.
Chỉ trả về câu ngữ cảnh, không giải thích thêm, không lặp lại nội dung đoạn trích.`;

function trimDocumentIfTooLong(doc: string, maxLen: number = 12000): string {
  if (doc.length <= maxLen) {
    return doc;
  }
  const half = Math.floor(maxLen / 2);
  const head = doc.slice(0, half);
  const tail = doc.slice(doc.length - half);
  return `${head}\n\n[... phần giữa được lược bớt ...]\n\n${tail}`;
}

export async function generateContext(fullDocument: string, chunkContent: string): Promise<string> {
  if (!config.contextual.enabled || !config.contextual.baseUrl || !config.contextual.model) {
    return "";
  }

  const endpoint = `${config.contextual.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const truncatedDoc = trimDocumentIfTooLong(fullDocument);

  const userMessage = `<document>
${truncatedDoc}
</document>

<chunk>
${chunkContent}
</chunk>`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.contextual.apiKey}`,
      },
      body: JSON.stringify({
        model: config.contextual.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[Contextualizer] HTTP ${res.status} from ${endpoint}: ${errBody}`);
      return "";
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const contextText = data.choices?.[0]?.message?.content?.trim() ?? "";
    return contextText;
  } catch (error) {
    console.warn("[Contextualizer] Failed to generate context for chunk:", error);
    return "";
  }
}
