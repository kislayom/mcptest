# mcpcert

[![ci](https://github.com/kislayom/mcpcert/actions/workflows/ci.yml/badge.svg)](https://github.com/kislayom/mcpcert/actions/workflows/ci.yml)

**The test suite + trust layer for MCP servers.**
Point it at any [Model Context Protocol](https://modelcontextprotocol.io) server and find out what's broken — in seconds, in your terminal, in CI.

> **Status: early.** `mcpcert doctor` — the zero-config health + conformance scan — is taking shape first. The code-first test DSL and the hosted drift-monitor follow. See the [roadmap](#roadmap).

## Why

MCP went from proposal to plumbing in about eighteen months: tens of millions of SDK downloads a month, thousands of public servers, now stewarded by the Linux Foundation. But the plumbing was laid fast. Public scans of the ecosystem keep finding servers that ship with no authentication, unsafe command paths, or malformed tool schemas — and because a tool's description is mutable and remote, an upstream server you depend on can quietly change what it claims to do after you ship, and your agent will faithfully do the new thing (the "rug pull").

In every other corner of software you'd never ship an API without tests in CI. There is no `pytest` for MCP. That's what this is.

## Install

```bash
npm i -g mcpcert
# or run it without installing:
npx mcpcert doctor https://your-server.example.com
```

## Usage

```bash
# remote (Streamable HTTP) server
mcpcert doctor https://your-mcp-server.example.com

# local stdio server — quote the whole command
mcpcert doctor "npx -y @modelcontextprotocol/server-filesystem /tmp"

mcpcert doctor https://your-mcp-server.example.com --json   # machine-readable
```

`doctor` is **100% deterministic** — no LLM is ever in this path, so it doesn't flake in CI. It exits non-zero when any check fails.

## Score & badge

```bash
mcpcert score https://your-mcp-server.example.com          # MCP Cert Score (0–100) + grade
mcpcert score https://your-mcp-server.example.com --badge  # Markdown badge for your README
```

`score` exits non-zero unless the server is **Certified** (≥80/100 with no failing checks) — so you can gate your own MCP server in CI.

## Test DSL (`run`)

Write declarative tests next to your server in a `*.mcpcert.yaml` file:

```yaml
server: "npx -y @modelcontextprotocol/server-filesystem /tmp"
tests:
  - name: list_directory returns entries
    tool: list_directory
    input: { path: "/tmp" }
    expect:
      error: false          # the call must not error
      contains: "tmp"       # substring in the text output
      matches: "(?i)tmp"    # ...or a regex
      # fields: { ok: true }       # assert structured-output fields by dot-path
      # max_latency_ms: 2000       # performance budget
      # no_secret_leak: true       # output must not leak secret-shaped strings
```

```bash
mcpcert run                              # runs *.mcpcert.yaml in the current dir
mcpcert run --reporter junit > junit.xml # JUnit for CI
```

Assertions are deterministic — no LLM in the path, so it never flakes.

## Leaderboard (`scan`)

```bash
mcpcert scan "npx -y @modelcontextprotocol/server-filesystem /tmp" https://another-server.example.com
mcpcert scan --file servers.txt --json
```

Scores every server and ranks them — the seed of a public "state of MCP" board.

## Drift detection — the "rug pull" check

A tool's description or schema can change *after* you've trusted it. Snapshot a server, then check for drift in CI:

```bash
mcpcert snapshot "npx -y @modelcontextprotocol/server-filesystem /tmp" -o baseline.json
mcpcert diff     "npx -y @modelcontextprotocol/server-filesystem /tmp" --baseline baseline.json
```

`diff` exits non-zero on any change and **escalates a description that turns injection-shaped to a suspected rug-pull.** Deterministic, no LLM. *(Continuous, hosted monitoring is the Watchtower.)*

## CI (GitHub Action)

Gate your MCP server's trust score on every PR:

```yaml
- uses: kislayom/mcpcert@v0.5.0
  with:
    target: "npx -y your-mcp-server"
    command: score      # non-zero exit unless Certified (≥80, no failing checks)
```

Works with `score`, `doctor`, `report`, `run`, and `diff`.

## Roadmap

- [x] `doctor` — HTTP reachability, discovery manifest, CORS
- [x] MCP protocol checks via `@modelcontextprotocol/sdk` — stdio + Streamable HTTP, handshake, `tools/list`
- [x] Deterministic lint — input-schema validity, missing descriptions, injection-shaped text, leaked secrets
- [x] `mcpcert score` — 0–100 MCP Cert Score, letter grade, certification + badge
- [x] Deep recursive schema validation + SSE transport fallback
- [x] `mcpcert run` — code-first YAML test DSL (deterministic) + JUnit reporter
- [x] `mcpcert scan` — multi-server leaderboard
- [x] `mcpcert snapshot` / `diff` — drift / rug-pull detection
- [x] `mcpcert report` — Markdown certification report + capability-risk audit
- [x] richer `run` assertions — structured fields, latency budgets, secret-leak
- [ ] Recorded, advisory semantic (LLM) assertions for `run`
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
