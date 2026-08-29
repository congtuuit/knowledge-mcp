# Model Context Protocol Architecture

The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely access external data sources and developer tools.

## Core Concepts

MCP servers expose resources, prompts, and tools to AI clients like Claude Code, Cursor, and Antigravity IDE.

## Streamable HTTP Transport

Streamable HTTP transport allows multiple concurrent clients to connect over a network port, exchanging standard JSON-RPC 2.0 messages.

## Security & Authentication

Servers can enforce authentication tokens using HTTP Bearer Authorization headers to safeguard private knowledge vaults against unauthorized access.
