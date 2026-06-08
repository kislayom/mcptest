# mcptest

[![ci](https://github.com/kislayom/mcptest/actions/workflows/ci.yml/badge.svg)](https://github.com/kislayom/mcptest/actions/workflows/ci.yml)

**The test suite + trust layer for MCP servers.**
Point it at any [Model Context Protocol](https://modelcontextprotocol.io) server and find out what's broken — in seconds, in your terminal, in CI.

> **Status: early.** `mcptest doctor` — the zero-config health + conformance scan — is taking shape first. The code-first test DSL and the hosted drift-monitor follow. See the [roadmap](#roadmap).

## Why

MCP went from proposal to plumbing in about eighteen months: tens of millions of SDK downloads a month, thousands of public servers, now stewarded by the Linux Foundation. But the plumbing was laid fast. Public scans of the ecosystem keep finding servers that ship with no authentication, unsafe command paths, or malformed tool schemas — and because a tool's description is mutable and remote, an upstream server you depend on can quietly change what it claims to do after you ship, and your agent will faithfully do the new thing (the "rug pull").

In every other corner of software you'd never ship an API without tests in CI. There is no `pytest` for MCP. That's what this is.

## Install

```bash
npm i -g mcptest
# or run it without installing:
npx mcptest doctor https://your-server.example.com
```

## Usage

```bash
# remote (Streamable HTTP) server
mcptest doctor https://your-mcp-server.example.com

# local stdio server — quote the whole command
mcptest doctor "npx -y @modelcontextprotocol/server-filesystem /tmp"

mcptest doctor https://your-mcp-server.example.com --json   # machine-readable
```

`doctor` is **100% deterministic** — no LLM is ever in this path, so it doesn't flake in CI. It exits non-zero when any check fails.

## Roadmap

- [x] `doctor` — HTTP reachability, discovery manifest, CORS
- [x] MCP protocol checks via `@modelcontextprotocol/sdk` — stdio + Streamable HTTP, handshake, `tools/list`
- [x] Deterministic lint — input-schema validity, missing descriptions, injection-shaped text, leaked secrets
- [ ] Deep JSON-Schema validation (ajv) + SSE transport
- [ ] `mcptest run` — code-first test DSL (deterministic core + recorded, advisory semantic checks)
- [ ] JUnit / SARIF reporters + a GitHub Action
- [ ] Watchtower — hosted, deterministic drift monitoring of the upstream servers you depend on

## Development

```bash
npm install
npm run build
npm test          # vitest
```

A testing tool ought to be tested — every deterministic check is covered, and CI runs the suite on each push.

## License

[Apache-2.0](./LICENSE)
