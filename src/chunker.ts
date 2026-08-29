import matter from "gray-matter";
import { config } from "./config.js";

export interface ChunkResult {
  headingPath: string;
  content: string;
}

export interface MarkdownChunkOutput {
  frontmatter: Record<string, any>;
  chunks: ChunkResult[];
}

function splitLongText(text: string, maxChars: number, overlapChars: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const paragraphs = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let currentBuffer = "";

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      // Paragraph itself is very long, flush current buffer first
      if (currentBuffer.length > 0) {
        chunks.push(currentBuffer.trim());
        currentBuffer = "";
      }
      // Slice long paragraph
      let start = 0;
      while (start < para.length) {
        const end = Math.min(start + maxChars, para.length);
        const slice = para.slice(start, end).trim();
        if (slice) {
          chunks.push(slice);
        }
        if (end >= para.length) break;
        start += maxChars - overlapChars;
      }
    } else {
      const candidate = currentBuffer ? `${currentBuffer}\n\n${para}` : para;
      if (candidate.length <= maxChars) {
        currentBuffer = candidate;
      } else {
        if (currentBuffer.length > 0) {
          chunks.push(currentBuffer.trim());
          // Create overlap from the end of currentBuffer
          const overlap = currentBuffer.slice(Math.max(0, currentBuffer.length - overlapChars)).trim();
          currentBuffer = overlap ? `${overlap}\n\n${para}` : para;
        } else {
          currentBuffer = para;
        }
      }
    }
  }

  if (currentBuffer.trim().length > 0) {
    chunks.push(currentBuffer.trim());
  }

  return chunks;
}

export function cleanMarkdownContent(text: string): string {
  // Strip inline base64 images to prevent bloating vector/FTS index with meaningless noise
  return text
    .replace(/!\[(.*?)\]\(data:image\/[^;]+;base64,[^\)]+\)/gi, "![$1]")
    .replace(/<img\s+[^>]*src=["']data:image\/[^;]+;base64,[^"']+["'][^>]*>/gi, "[image]");
}

export function chunkMarkdown(text: string): MarkdownChunkOutput {
  const cleanedInput = cleanMarkdownContent(text);
  const parsed = matter(cleanedInput);
  const rawContent = parsed.content;
  const maxChars = config.chunk.maxTokensApprox * 4;
  const overlapChars = config.chunk.overlapApprox * 4;

  const lines = rawContent.split(/\r?\n/);
  const sections: { headingPath: string; lines: string[] }[] = [];

  const headingStack: { level: number; text: string }[] = [];
  let currentSectionLines: string[] = [];
  let currentHeadingPath = "";

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Flush previous section
      if (currentSectionLines.length > 0) {
        sections.push({
          headingPath: currentHeadingPath,
          lines: currentSectionLines,
        });
        currentSectionLines = [];
      }

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      // Pop headings with equal or greater depth
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text: title });
      currentHeadingPath = headingStack.map((h) => h.text).join(" > ");
    } else {
      currentSectionLines.push(line);
    }
  }

  if (currentSectionLines.length > 0) {
    sections.push({
      headingPath: currentHeadingPath,
      lines: currentSectionLines,
    });
  }

  const chunks: ChunkResult[] = [];

  for (const section of sections) {
    const sectionText = section.lines.join("\n").trim();
    if (!sectionText) continue;

    const subChunks = splitLongText(sectionText, maxChars, overlapChars);
    for (const subChunk of subChunks) {
      chunks.push({
        headingPath: section.headingPath,
        content: subChunk,
      });
    }
  }

  return {
    frontmatter: parsed.data,
    chunks,
  };
}

export function chunkPlainText(text: string): ChunkResult[] {
  const cleaned = cleanMarkdownContent(text);
  const maxChars = config.chunk.maxTokensApprox * 4;
  const overlapChars = config.chunk.overlapApprox * 4;
  const subChunks = splitLongText(cleaned, maxChars, overlapChars);

  return subChunks.map((content) => ({
    headingPath: "",
    content,
  }));
}

