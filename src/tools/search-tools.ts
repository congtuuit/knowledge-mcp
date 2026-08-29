import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { hybridSearch, keywordSearch, vectorSearch } from "../search.js";
import { graphHybridSearch } from "../graph.js";

export function registerSearchTools(server: McpServer): void {
  // Tool 1: hybrid_search
  server.tool(
    "hybrid_search",
    "Tim kiem tai lieu noi bo ket hop Full-text BM25 + Vector Cosine qua thuat toan Reciprocal Rank Fusion (RRF k=60) de tra cuu chi tiet cac chunk kien thuc.",
    {
      query: z.string().describe("Noi dung hoac cau hoi can tim trong knowledge vault"),
      k: z.number().optional().default(8).describe("So luong ket qua can lay (mac dinh: 8)"),
    },
    async ({ query, k }) => {
      try {
        const results = await hybridSearch(query, k);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `Error executing hybrid search: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // Tool 2: keyword_search
  server.tool(
    "keyword_search",
    "Tim kiem tu khoa chinh xac qua SQLite FTS5 (BM25 ranking)",
    {
      query: z.string().describe("Tu khoa hoac cum tu can tim"),
      k: z.number().optional().default(8).describe("So luong ket qua can lay (mac dinh: 8)"),
    },
    async ({ query, k }) => {
      try {
        const results = await keywordSearch(query, k);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `Error executing keyword search: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // Tool 3: similar_notes
  server.tool(
    "similar_notes",
    "Tim kiem tuong dong ngu nghia bang Vector Cosine Similarity",
    {
      query: z.string().describe("Cau hoi hoac doan van ban mau can tim cac ghi chu tuong dong ngu nghia"),
      k: z.number().optional().default(8).describe("So luong ket qua can lay (mac dinh: 8)"),
    },
    async ({ query, k }) => {
      try {
        const results = await vectorSearch(query, k);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `Error executing vector search: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // Tool 6: context_for_query
  server.tool(
    "context_for_query",
    "TU DONG DUNG cong cu nay de tra cuu tai lieu noi bo, quy chuan coding Sitecore, kien truc va best practices du an khi nguoi dung hoi cac cau hoi ky thuat/nghiep vu. Ghep cac doan context lien quan nhat thanh Markdown san sang nhung vao prompt.",
    {
      query: z.string().describe("Cau hoi hoac yeu cau can lay ngu canh"),
      maxTokens: z.number().optional().default(2000).describe("Gioi han token uoc tinh cho ngu canh (mac dinh: 2000)"),
    },
    async ({ query, maxTokens }) => {
      try {
        const chunks = await hybridSearch(query, 15);
        let totalEstimatedTokens = 0;
        const includedSources: Array<{ filePath: string; headingPath: string | null; score: number }> = [];
        let contextMarkdown = "";

        for (const chunk of chunks) {
          const header = `### [${chunk.filePath}]${chunk.headingPath ? ` > ${chunk.headingPath}` : ""}\n`;
          const body = `${chunk.content}\n\n---\n\n`;
          const block = header + body;
          const estimatedTokens = Math.ceil(block.length / 4);

          if (totalEstimatedTokens + estimatedTokens > maxTokens && includedSources.length > 0) break;

          contextMarkdown += block;
          totalEstimatedTokens += estimatedTokens;
          includedSources.push({ filePath: chunk.filePath, headingPath: chunk.headingPath, score: Number(chunk.score.toFixed(4)) });
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ query, maxTokens, estimatedTokens: totalEstimatedTokens, chunksCount: includedSources.length, sources: includedSources, context: contextMarkdown.trim() }, null, 2),
          }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `Error retrieving context: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // Tool 10: graph_hybrid_search
  server.tool(
    "graph_hybrid_search",
    "Tim kiem hybrid (BM25 + Vector + RRF) ket hop mo rong 1-hop graph de tra ve ca text chunks lan cac entities lien quan den ket qua tim kiem.",
    {
      query: z.string().describe("Noi dung can tim kiem"),
      k: z.number().optional().default(8).describe("So luong chunks ket qua (mac dinh 8)"),
    },
    async ({ query, k }) => {
      try {
        const results = await graphHybridSearch(query, k);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results.map((r) => ({ chunkId: r.chunkId, filePath: r.filePath, headingPath: r.headingPath, content: r.content, score: r.score, relatedEntities: r.relatedEntities })), null, 2),
          }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `graph_hybrid_search error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
}
