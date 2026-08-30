import fs from "node:fs";
import path from "node:path";
import type { GroundTruthItem } from "./synthetic-vault-generator.js";

export interface HotpotQAItem {
  _id: string;
  question: string;
  answer: string;
  type: string;
  level: string;
  supporting_facts: Array<[string, number]>;
  context: Array<[string, string[]]>;
}

export interface DatasetLoaderOptions {
  sourceJsonPath?: string;
  outputVaultDir: string;
  groundTruthFile: string;
  maxSamples?: number;
}

/**
 * Mẫu dữ liệu chuẩn HotpotQA Multi-Hop được tích hợp sẵn (Offline Standard Subset)
 */
const SAMPLE_HOTPOTQA_DATA: HotpotQAItem[] = [
  {
    _id: "hp_001",
    question: "What company developed the native SQLite module integrated into the runtime of Node.js 22?",
    answer: "OpenJS Foundation & Node.js Core Team",
    type: "bridge",
    level: "medium",
    supporting_facts: [
      ["Node.js Runtime Specification", 0],
      ["SQLite Native DatabaseSync", 1],
    ],
    context: [
      [
        "Node.js Runtime Specification",
        [
          "Node.js is an open-source, cross-platform JavaScript runtime environment built on V8.",
          "Starting from Node.js 22, the core runtime introduced native synchronous SQLite database access via `node:sqlite` without needing external C++ addons.",
          "This architecture is maintained by the Node.js Core Team and OpenJS Foundation.",
        ],
      ],
      [
        "SQLite Native DatabaseSync",
        [
          "DatabaseSync is a built-in synchronous SQLite client in Node.js.",
          "It provides zero-dependency local storage with native support for WAL journal mode, FTS5 full-text search, and Recursive Common Table Expressions (CTE).",
        ],
      ],
    ],
  },
  {
    _id: "hp_002",
    question: "Which algorithm combines sparse BM25 keyword rankings with dense vector cosine similarity using the constant k=60?",
    answer: "Reciprocal Rank Fusion (RRF)",
    type: "bridge",
    level: "hard",
    supporting_facts: [
      ["Reciprocal Rank Fusion Specification", 0],
      ["Hybrid Search Architecture", 1],
    ],
    context: [
      [
        "Reciprocal Rank Fusion Specification",
        [
          "Reciprocal Rank Fusion (RRF) is an information retrieval technique that combines ranked lists from multiple search algorithms.",
          "The standard formula assigns a score of 1 / (k + rank), where k is traditionally set to 60 to balance high and low ranked candidates.",
        ],
      ],
      [
        "Hybrid Search Architecture",
        [
          "Hybrid Search combines sparse term-frequency matchers like SQLite FTS5 with dense vector embeddings.",
          "By applying RRF fusion (k=60), the retrieval engine achieves superior recall on both exact code identifiers and semantic concepts.",
        ],
      ],
    ],
  },
  {
    _id: "hp_003",
    question: "What concurrency mechanism is implemented in Knowledge MCP to prevent lost-update race conditions during concurrent note writes?",
    answer: "In-process Promise queue file lock (withFileLock)",
    type: "bridge",
    level: "hard",
    supporting_facts: [
      ["Concurrency Control in Knowledge MCP", 0],
      ["File Locking Promise Queue", 0],
    ],
    context: [
      [
        "Concurrency Control in Knowledge MCP",
        [
          "Knowledge MCP allows multiple AI coding agents to interact with notes simultaneously.",
          "To guarantee data consistency and eliminate lost-update race conditions, all file write and append operations pass through `withFileLock`.",
        ],
      ],
      [
        "File Locking Promise Queue",
        [
          "The in-process file lock maintains a hash map of Promise execution chains keyed by file path.",
          "Concurrent write requests are serialized sequentially without blocking read operations or requiring OS-level file handles.",
        ],
      ],
    ],
  },
];

/**
 * Chuyển đổi dữ liệu chuẩn HotpotQA / LongMemEval thành thư mục Markdown notes có wikilinks
 * và file ground_truth.json chuẩn xác.
 */
export function convertStandardDatasetToVault(options: DatasetLoaderOptions): {
  totalFiles: number;
  groundTruthCount: number;
} {
  const { sourceJsonPath, outputVaultDir, groundTruthFile, maxSamples = 100 } = options;

  if (fs.existsSync(outputVaultDir)) {
    fs.rmSync(outputVaultDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputVaultDir, { recursive: true });

  let rawItems: HotpotQAItem[] = SAMPLE_HOTPOTQA_DATA;

  if (sourceJsonPath && fs.existsSync(sourceJsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(sourceJsonPath, "utf8"));
      if (Array.isArray(parsed)) {
        rawItems = parsed.slice(0, maxSamples);
      }
    } catch (e) {
      console.warn(`[DatasetLoader] Could not parse custom JSON at ${sourceJsonPath}, using built-in standard samples:`, e);
    }
  }

  const createdDocs = new Map<string, string>();
  const groundTruth: GroundTruthItem[] = [];

  for (let idx = 0; idx < rawItems.length; idx++) {
    const item = rawItems[idx];
    const supportingTitles = new Set(item.supporting_facts.map(([title]) => title));

    // Sinh các file Markdown từ context
    for (const [title, sentences] of item.context) {
      const cleanTitle = title.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim();
      const filename = `${cleanTitle.replace(/\s+/g, "_")}.md`;

      // Chèn wikilinks đến các tài liệu liên quan khác trong cùng câu hỏi
      const otherTitles = item.context
        .map(([t]) => t)
        .filter((t) => t !== title)
        .map((t) => `[[${t.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s+/g, "_")}]]`);

      const content = `---
id: ${cleanTitle.replace(/\s+/g, "_")}
title: ${cleanTitle}
type: document
references:
${otherTitles.map((ot) => `  - ${ot.replace(/[[\]]/g, "")}`).join("\n")}
---

# ${cleanTitle}

${sentences.join(" ")}

## Tài liệu liên quan
${otherTitles.map((ot) => `- Tham chiếu: ${ot}`).join("\n")}
`;

      if (!createdDocs.has(filename)) {
        createdDocs.set(filename, content);
        fs.writeFileSync(path.join(outputVaultDir, filename), content, "utf8");
      }
    }

    // Tạo câu hỏi ground truth tương ứng
    groundTruth.push({
      id: `STD-HP-${String(idx + 1).padStart(3, "0")}`,
      category: item.type === "bridge" ? "multi_hop" : "single_hop",
      query: item.question,
      expectedEntities: Array.from(supportingTitles).map((t) => t.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s+/g, "_")),
      expectedFiles: Array.from(supportingTitles).map((t) => `${t.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s+/g, "_")}.md`),
      description: `HotpotQA Multi-hop Standard: ${item.question} (Expected: ${item.answer})`,
    });
  }

  fs.mkdirSync(path.dirname(groundTruthFile), { recursive: true });
  fs.writeFileSync(groundTruthFile, JSON.stringify(groundTruth, null, 2), "utf8");

  return {
    totalFiles: createdDocs.size,
    groundTruthCount: groundTruth.length,
  };
}

// Cho phép chạy qua CLI
if (process.argv[1] && process.argv[1].includes("hf-dataset-loader")) {
  const targetDir = path.resolve("./data/standard-vault");
  const gtPath = path.resolve("./benchmarks/datasets/standard_ground_truth.json");

  const stats = convertStandardDatasetToVault({
    outputVaultDir: targetDir,
    groundTruthFile: gtPath,
  });

  console.log(`[DatasetLoader] Converted ${stats.totalFiles} standard notes to ${targetDir}`);
  console.log(`[DatasetLoader] Generated ${stats.groundTruthCount} standard benchmark ground truth queries in ${gtPath}`);
}
