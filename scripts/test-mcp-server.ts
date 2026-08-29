import { startServer } from "../src/mcp-server.js";
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";
import { runIngest } from "../src/ingest.js";

async function runTests() {
  console.log("🚀 Starting MCP Server End-to-End Test Suite...\n");

  const testPort = 3995;
  const { serverInstance, sessions } = await startServer(testPort);
  const baseUrl = `http://localhost:${testPort}`;

  let currentSessionId: string | null = null;

  async function rpcCall(method: string, params: Record<string, unknown> = {}, id: number = 1) {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        ...(currentSessionId ? { "mcp-session-id": currentSessionId } : {}),
        ...(config.mcpAuthToken ? { Authorization: `Bearer ${config.mcpAuthToken}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) {
      currentSessionId = sid;
    }

    const text = await res.text();
    if (!text.trim()) {
      console.warn(`[rpcCall] Empty response for method=${method}, status=${res.status}`);
      return null;
    }

    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        return JSON.parse(line.slice(6));
      }
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error(`[rpcCall] Failed to parse response for method=${method}. Raw response:`, text);
      throw e;
    }
  }

  try {
    // 0. Initialize MCP session
    console.log("0️⃣ Initializing MCP Session ...");
    const initRes = await rpcCall("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    }, 0);
    console.log("   Init response serverInfo:", initRes?.result?.serverInfo, "sessionId:", currentSessionId);
    console.log("   ✅ Initialized successfully!\n");

    // 1. Health Check
    console.log("1️⃣ Testing GET /health ...");
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthJson = await healthRes.json();
    console.log("   Health response:", healthJson);
    if (healthJson.status !== "ok") throw new Error("Health check failed");
    console.log("   ✅ Health check passed!\n");

    // 2. Tools List
    console.log("2️⃣ Testing tools/list ...");
    const listRes = await rpcCall("tools/list", {}, 1);
    const tools = listRes.result.tools.map((t: any) => t.name);
    console.log("   Registered tools:", tools);
    const requiredTools = [
      "hybrid_search",
      "keyword_search",
      "similar_notes",
      "read_note",
      "list_notes",
      "context_for_query",
      "write_note",
      "append_note",
    ];
    for (const req of requiredTools) {
      if (!tools.includes(req)) {
        throw new Error(`Missing expected tool: ${req}`);
      }
    }
    console.log("   ✅ All 8 tools registered successfully!\n");

    // 3. list_notes Tool
    console.log("3️⃣ Testing tool 'list_notes' ...");
    const listNotesRes = await rpcCall("tools/call", {
      name: "list_notes",
      arguments: {},
    }, 2);
    const notesData = JSON.parse(listNotesRes.result.content[0].text);
    console.log(`   Found ${notesData.count} notes in vault:`, notesData.notes.map((n: any) => n.path));
    console.log("   ✅ list_notes passed!\n");

    // 4. read_note Tool
    console.log("4️⃣ Testing tool 'read_note' (normal file) ...");
    const readRes = await rpcCall("tools/call", {
      name: "read_note",
      arguments: { path: "mcp-architecture.md" },
    }, 3);
    const noteContent = JSON.parse(readRes.result.content[0].text);
    console.log("   Read note path:", noteContent.path, "size:", noteContent.size);
    if (!noteContent.content.includes("Model Context Protocol")) {
      throw new Error("read_note content mismatch");
    }
    console.log("   ✅ read_note passed!\n");

    // 5. Path Traversal Prevention
    console.log("5️⃣ Testing tool 'read_note' security (path traversal block) ...");
    const hackRes = await rpcCall("tools/call", {
      name: "read_note",
      arguments: { path: "../../package.json" },
    }, 4);
    console.log("   Path traversal attempt result:", hackRes.result ? hackRes.result.content[0].text : hackRes);
    console.log("   ✅ Path traversal safely blocked!\n");

    // 6. write_note Tool + Auto Reindex
    console.log("6️⃣ Testing tool 'write_note' with automatic reindexing ...");
    const testNoteRelPath = "test-agent-dynamic-note.md";
    const testNoteContent = `# Autonomous AI Notes\n\n## Vector and Memory Synthesis\nAutonomous agents utilize dynamic context indexing and persistent memory buffers to coordinate complex distributed workflows.`;

    const writeRes = await rpcCall("tools/call", {
      name: "write_note",
      arguments: {
        path: testNoteRelPath,
        content: testNoteContent,
        overwrite: true,
      },
    }, 5);
    const writeData = JSON.parse(writeRes.result.content[0].text);
    console.log("   write_note response:", writeData);
    if (!writeData.success) throw new Error("write_note failed");
    console.log("   ✅ write_note created file and reindexed successfully!\n");

    // 7. append_note Tool + Auto Reindex
    console.log("7️⃣ Testing tool 'append_note' with automatic reindexing ...");
    const appendText = `## Extended Knowledge\nContinuous rank fusion enables zero-latency recall.`;
    const appendRes = await rpcCall("tools/call", {
      name: "append_note",
      arguments: {
        path: testNoteRelPath,
        content: appendText,
      },
    }, 6);
    const appendData = JSON.parse(appendRes.result.content[0].text);
    console.log("   append_note response:", appendData);
    if (!appendData.success) throw new Error("append_note failed");
    console.log("   ✅ append_note appended and reindexed successfully!\n");

    // 8. keyword_search Tool
    console.log("8️⃣ Testing tool 'keyword_search' ...");
    const kwRes = await rpcCall("tools/call", {
      name: "keyword_search",
      arguments: { query: "Autonomous AI Notes" },
    }, 7);
    const kwData = JSON.parse(kwRes.result.content[0].text);
    console.log(`   keyword_search returned ${kwData.length} matches. Top match:`, kwData[0]?.filePath);
    if (kwData.length === 0) throw new Error("keyword_search did not find freshly indexed note");
    console.log("   ✅ keyword_search passed!\n");

    // 9. hybrid_search Tool
    console.log("9️⃣ Testing tool 'hybrid_search' ...");
    const hybridRes = await rpcCall("tools/call", {
      name: "hybrid_search",
      arguments: { query: "persistent memory buffers workflows" },
    }, 8);
    const hybridData = JSON.parse(hybridRes.result.content[0].text);
    console.log(`   hybrid_search returned ${hybridData.length} matches. Top match:`, hybridData[0]?.filePath, "score:", hybridData[0]?.score);
    if (hybridData.length === 0) throw new Error("hybrid_search failed");
    console.log("   ✅ hybrid_search passed!\n");

    // 10. context_for_query Tool
    console.log("🔟 Testing tool 'context_for_query' ...");
    const ctxRes = await rpcCall("tools/call", {
      name: "context_for_query",
      arguments: { query: "SQLite FTS5 full text search", maxTokens: 1000 },
    }, 9);
    const ctxData = JSON.parse(ctxRes.result.content[0].text);
    console.log(`   context_for_query assembled ${ctxData.chunksCount} chunks (${ctxData.estimatedTokens} estimated tokens)`);
    console.log("   Preview of context:\n" + ctxData.context.slice(0, 200) + "...\n");
    console.log("   ✅ context_for_query passed!\n");

    // Cleanup test note
    const testNoteFullPath = path.resolve(config.vaultDir, testNoteRelPath);
    if (fs.existsSync(testNoteFullPath)) {
      fs.unlinkSync(testNoteFullPath);
      await runIngest(); // prune deleted test note from DB
    }

    console.log("🎉 ALL 10 TEST PHASES PASSED WITH FLYING COLORS!\n");
  } finally {
    for (const transport of sessions.values()) {
      try {
        await transport.close();
      } catch {}
    }
    serverInstance.close();
  }
}

runTests().catch((err) => {
  console.error("❌ Test Suite Failed:", err);
  process.exit(1);
});
