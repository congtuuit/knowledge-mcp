---
title: Model Context Protocol Architecture
tags: [mcp, architecture, streamable-http, json-rpc, ai-agent]
category: Protocols & AI Infrastructure
---

# Model Context Protocol Architecture

The **Model Context Protocol (MCP)** is an open standard developed by Anthropic that enables AI assistants to securely access external data sources, developer tools, and persistent memory.

---

## 1. Core Concepts

MCP establishes a client-server architecture where:
* **Host / Client**: AI coding assistants (like Antigravity IDE, Claude Code, Cursor) that initiate tool requests.
* **Server**: Lightweight local or remote servers that expose resources, prompts, and tools over standard interfaces.

---

## 2. Streamable HTTP Transport

Streamable HTTP transport allows multiple concurrent clients to connect over a network port (e.g. `http://localhost:3900/mcp`), exchanging standard JSON-RPC 2.0 messages over HTTP POST and Server-Sent Events (SSE).

---

## 3. Security & Authentication

Servers can enforce authentication tokens using standard HTTP Bearer Authorization headers (`Authorization: Bearer <TOKEN>`) to safeguard private knowledge vaults against unauthorized access.
