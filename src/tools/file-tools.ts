import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import { runIngest } from "../ingest.js";
import { resolveSafePath, listVaultFiles } from "../mcp-server.js";

// ==========================================
// In-Process File Lock (Fix: Race condition)
// Prevents lost-update on concurrent append_note / write_note calls
// for the same file path.
// ==========================================

const fileLocks = new Map<string, Promise<void>>();

async function withFileLock<T>(fullPath: string, fn: () => Promise<T>): Promise<T> {
  // Chain onto any existing lock for this path
  const existing = fileLocks.get(fullPath) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  // Register the "slot" immediately so concurrent callers queue up
  fileLocks.set(fullPath, existing.then(() => next));

  let result!: T;
  try {
    await existing;        // Wait for the previous lock holder to finish
    result = await fn();   // Execute critical section
  } finally {
    resolve();             // Release this slot
    // Clean up map entry if no one else is waiting
    if (fileLocks.get(fullPath) === next) {
      fileLocks.delete(fullPath);
    }
  }
  return result;
}

export function registerFileTools(server: McpServer): void {
  // Tool 4: read_note
  server.tool(
    "read_note",
    "Doc noi dung day du cua mot file ghi chu trong vault (chan path traversal)",
    {
      path: z.string().describe("Duong dan tuong doi cua file trong vault (vi du: mcp-architecture.md hoac docs/guide.md)"),
    },
    async ({ path: notePath }) => {
      try {
        const { fullPath, relPath } = resolveSafePath(notePath);
        if (!fs.existsSync(fullPath)) {
          return { isError: true, content: [{ type: "text", text: `File not found: ${relPath}` }] };
        }
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          return { isError: true, content: [{ type: "text", text: `Target is a directory, not a file: ${relPath}` }] };
        }
        const content = fs.readFileSync(fullPath, "utf-8");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ path: relPath, mtime: stat.mtime.toISOString(), size: stat.size, content }, null, 2),
          }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `Error reading note: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // Tool 5: list_notes
  server.tool(
    "list_notes",
    "Liet ke danh sach tat ca cac file ghi chu hien co trong vault (ho tro loc theo prefix)",
    {
      prefix: z.string().optional().describe("Tien to duong dan hoac thu muc de loc (vi du: 'docs/' hoac 'guides')"),
    },
    async ({ prefix }) => {
      try {
        // Sanitize prefix to prevent directory probe
        const safePrefix = prefix
          ? path.normalize(prefix).replace(/^(\.\.[\\/])+/, "")
          : undefined;
        const files = listVaultFiles(config.vaultDir, safePrefix);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ count: files.length, vaultDir: config.vaultDir, prefix: safePrefix ?? null, notes: files }, null, 2),
          }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `Error listing notes: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // Tool 7: write_note
  server.tool(
    "write_note",
    "Tao moi mot file ghi chu trong vault va tu dong cap nhat chi muc tim kiem (reindex) tuc thi",
    {
      path: z.string().describe("Duong dan file can tao trong vault (vi du: notes/new-idea.md)"),
      content: z.string().describe("Noi dung ghi chu"),
      overwrite: z.boolean().optional().default(false).describe("Cho phep ghi de neu file da ton tai"),
    },
    async ({ path: notePath, content, overwrite }) => {
      try {
        const { fullPath, relPath } = resolveSafePath(notePath);

        const ingestStats = await withFileLock(fullPath, async () => {
          if (fs.existsSync(fullPath) && !overwrite) {
            // Signal early return via thrown error with sentinel value
            throw Object.assign(new Error("FILE_EXISTS"), { code: "FILE_EXISTS", relPath });
          }
          const parentDir = path.dirname(fullPath);
          if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
          fs.writeFileSync(fullPath, content, "utf-8");
          return runIngest({ onlyFile: fullPath });
        }).catch((err: unknown) => {
          if (err instanceof Error && (err as NodeJS.ErrnoException).code === "FILE_EXISTS") {
            throw err; // re-throw to outer catch
          }
          throw err;
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, path: relPath, message: "Note written and reindexed successfully", ingestStats }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code === "FILE_EXISTS") {
          const e = error as Error & { relPath?: string };
          return { isError: true, content: [{ type: "text", text: `Error: File '${e.relPath}' already exists. Set overwrite=true to replace it.` }] };
        }
        return { isError: true, content: [{ type: "text", text: `Error writing note: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // Tool 8: append_note  (uses file lock — fixes race condition)
  server.tool(
    "append_note",
    "Bo sung them noi dung vao cuoi mot file ghi chu trong vault va tu dong cap nhat chi muc tim kiem (reindex) tuc thi",
    {
      path: z.string().describe("Duong dan file can bo sung noi dung trong vault (vi du: notes/journal.md)"),
      content: z.string().describe("Noi dung can ghi them"),
    },
    async ({ path: notePath, content }) => {
      try {
        const { fullPath, relPath } = resolveSafePath(notePath);

        const ingestStats = await withFileLock(fullPath, async () => {
          const parentDir = path.dirname(fullPath);
          if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

          if (fs.existsSync(fullPath)) {
            const existing = fs.readFileSync(fullPath, "utf-8");
            const separator = existing.endsWith("\n") ? "\n" : "\n\n";
            fs.writeFileSync(fullPath, existing + separator + content, "utf-8");
          } else {
            fs.writeFileSync(fullPath, content, "utf-8");
          }
          return runIngest({ onlyFile: fullPath });
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, path: relPath, message: "Note appended and reindexed successfully", ingestStats }, null, 2),
          }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `Error appending note: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
}
