import { chunkMarkdown, chunkPlainText } from "../src/chunker.js";

async function main() {
  console.log("Testing Chunker Module (Phase 2)...");

  const longParagraph = "Đây là đoạn văn dài nhằm kiểm tra tính năng sub-chunking khi vượt quá giới hạn token. ".repeat(40);

  const sampleMarkdown = `---
title: Sample Architecture Document
tags: [knowledge, mcp, architecture]
---

# Main Overview

Tài liệu này mô tả kiến trúc tổng thể của hệ thống.

## Section 1: Database Design

Phần này giới thiệu cấu trúc bảng SQLite và FTS5. Bảng files và bảng chunks được liên kết chặt chẽ.

## Section 2: Chunker & Vector Search

${longParagraph}

## Section 3: MCP Server Transport

Phần này giới thiệu về Streamable HTTP Transport và các MCP Tools.
`;

  const mdResult = chunkMarkdown(sampleMarkdown);
  console.log("Extracted Frontmatter:", mdResult.frontmatter);
  console.log(`Generated ${mdResult.chunks.length} chunks from Markdown.`);

  for (let i = 0; i < mdResult.chunks.length; i++) {
    const chunk = mdResult.chunks[i];
    console.log(`\n--- Chunk #${i + 1} ---`);
    console.log(`Heading Path: "${chunk.headingPath}"`);
    console.log(`Length: ${chunk.content.length} chars (~${Math.ceil(chunk.content.length / 4)} tokens)`);
    console.log(`Content Preview: ${chunk.content.slice(0, 100)}...`);
  }

  // Verifications
  const headings = mdResult.chunks.map((c) => c.headingPath);
  if (!headings.some((h) => h.includes("Main Overview"))) throw new Error("Missing Main Overview heading");
  if (!headings.some((h) => h.includes("Section 1: Database Design"))) throw new Error("Missing Section 1 heading");
  if (!headings.some((h) => h.includes("Section 2: Chunker & Vector Search"))) throw new Error("Missing Section 2 heading");
  if (!headings.some((h) => h.includes("Section 3: MCP Server Transport"))) throw new Error("Missing Section 3 heading");

  const section2Chunks = mdResult.chunks.filter((c) => c.headingPath.includes("Section 2"));
  console.log(`Section 2 split into ${section2Chunks.length} chunk(s).`);
  if (section2Chunks.length < 2) {
    throw new Error("Long paragraph was not split into multiple sub-chunks!");
  }

  // Plain text test
  const samplePlain = "Đoạn 1.\n\n" + longParagraph + "\n\nĐoạn kết thúc.";
  const plainResult = chunkPlainText(samplePlain);
  console.log(`Generated ${plainResult.length} chunks from PlainText.`);
  if (plainResult.length < 2) {
    throw new Error("Plain text chunking failed to split long text!");
  }

  console.log("Phase 2 Chunker Test PASSED successfully!");
}

main().catch((err) => {
  console.error("Chunker Test Failed:", err);
  process.exit(1);
});
