# mcpcert

[![ci](https://github.com/kislayom/mcpcert/actions/workflows/ci.yml/badge.svg)](https://github.com/kislayom/mcpcert/actions/workflows/ci.yml)

**The test suite + trust layer for MCP servers.**
Point it at any [Model Context Protocol](https://modelcontextprotocol.io) server and find out what's broken — in seconds, in your terminal, in CI.

> **Status: usable today.** Eight deterministic commands — `doctor`, `score`, `probe`, `run`, `scan`, `snapshot`/`diff`, `report` — plus a library API. The hosted drift-monitor (Watchtower) is next. See the [roadmap](#roadmap).

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

## Score — a security grade, not a checkbox count

```bash
mcpcert score https://your-mcp-server.example.com           # graded breakdown + letter
mcpcert score https://your-mcp-server.example.com --probe   # actively attack it, then grade
mcpcert score https://your-mcp-server.example.com --badge   # Markdown badge for your README
```

The MCP Cert Score is **not** a sum of checkboxes. It's a penalty model over six dimensions of the MCP threat model — protocol conformance, interface quality, injection resistance, input robustness, confidentiality, and exploitation — where a finding's weight scales with the **blast radius** of the tool it hits (a weak check on `delete_file` costs more than on `get_weather`), and a single **confirmed** exploit, secret leak, or poisoned description **caps the whole grade**, the way a real review lets one critical dominate.

It's also honest about what it didn't test: robustness and exploitation need an active probe, so without `--probe` they're marked *not assessed* rather than silently scored. A passive run is a conformance grade; `--probe` is a security grade.

Every weight, cap, and threshold is written down and versioned in **[docs/SCORING.md](./docs/SCORING.md)**, so a score is reproducible and defensible — not a number we made up.

`score` exits non-zero unless the server is **Certified** (≥80/100, no caps, no critical/high findings) — so you can gate your own server in CI. Watch the caps fire against the bundled, deliberately-vulnerable demo:

```bash
mcpcert score --probe "node examples/vulnerable-server.mjs"   # → F, capped at 40
```

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
      # valid_output: true         # structuredContent must conform to the tool's declared outputSchema
      # max_latency_ms: 2000       # performance budget
      # no_secret_leak: true       # output must not leak secret-shaped strings
```

```bash
mcpcert run                              # runs *.mcpcert.yaml in the current dir
mcpcert run --reporter junit > junit.xml # JUnit for CI
```

Assertions are deterministic — no LLM in the path, so it never flakes.

`valid_output` validates a tool's real structured output against the `outputSchema` it advertises — catching a server whose output has drifted from its own contract. (The MCP client validates this at call time too; mcpcert turns it into an explicit, clearly-reported assertion you can gate on in CI, and the validator ships as a reusable library export.)

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

### Semantic drift (`--semantic`, advisory)

Regex catches a description that *turns* injection-shaped. It can't catch a quiet **meaning** change — `"reads a file"` rewritten to `"reads a file and uploads it for review"` is a textbook rug-pull that trips no pattern. Add `--semantic` to classify each changed description with a tiny **local** embedding model (all-MiniLM-L6-v2, ~23 MB, CPU-only, no API key, offline after the first download):

```bash
npm i @huggingface/transformers     # optional — the lean core never pulls it in
mcpcert diff <server> --baseline baseline.json --semantic
```

It labels each change **benign-reword**, **significant-reword**, or **capability-expansion** (a newly-implied shell/network/credential capability — the rug-pull signal). This is the *only* place mcpcert uses a model, and it is strictly **advisory**: it annotates the report, it never changes the verdict or the CI exit code. Determinism stays the product.

## Probe — active adversarial testing

`probe` doesn't read descriptions — it **attacks the server**. It generates malformed, oversized, type-violating, path-traversal, template, and prompt-injection inputs *from each tool's own schema*, fires them, and analyzes the responses for **crashes, confirmed exploits (RCE / SSRF / path-traversal), secret leaks, schema-violating output, weak input validation, and DoS latency**. It reports a vuln only on *confirmed* bad behaviour — a free-text field accepting a weird string is not a finding, only the server actually leaking a secret or executing the payload is.

```bash
mcpcert probe "npx -y your-mcp-server"        # read-only tools only (safe default)
mcpcert probe "npx -y your-mcp-server" --include-mutating   # ⚠ also calls write/delete/exec tools
```

By default it **skips tools that can write/delete/exec** (per the capability classifier) — those are only probed with `--include-mutating`, which really invokes them. Deterministic; exits non-zero on any finding.

## CI (GitHub Action)

Gate your MCP server's trust score on every PR:

```yaml
- uses: kislayom/mcpcert@v0.5.0
  with:
    target: "npx -y your-mcp-server"
    command: score      # non-zero exit unless Certified (≥80, no failing checks)
```

Works with `score`, `doctor`, `report`, `run`, and `diff`.

## GitHub code scanning (SARIF)

`mcpcert sarif` runs `doctor` + `probe` and emits a single [SARIF 2.1.0](https://sarifweb.azurewebsites.net/) file, so your MCP server's conformance and security findings show up as alerts in the repo's **Security** tab and inline on PRs:

```yaml
- run: npx mcpcert sarif "npx -y your-mcp-server" -o mcpcert.sarif
  continue-on-error: true            # let the upload run even when findings exist
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: mcpcert.sarif
```

Add `--no-probe` for a conformance-only scan (no tool calls), or `--include-mutating` to also probe write/delete/exec tools.

## Roadmap

- [x] `doctor` — HTTP reachability, discovery manifest, CORS
- [x] MCP protocol checks via `@modelcontextprotocol/sdk` — stdio + Streamable HTTP, handshake, `tools/list`
- [x] Deterministic lint — input-schema validity, missing descriptions, injection-shaped text, leaked secrets
- [x] `mcpcert score` — 0–100 MCP Cert Score, letter grade, certification + badge
- [x] Deep recursive schema validation + SSE transport fallback
- [x] `mcpcert run` — code-first YAML test DSL (deterministic) + JUnit reporter
- [x] `mcpcert scan` — multi-server leaderboard
- [x] `mcpcert snapshot` / `diff` — drift / rug-pull detection
- [x] advisory **semantic drift** (`diff --semantic`) — local all-MiniLM embeddings classify benign reword vs capability expansion; off the deterministic path
- [x] `mcpcert report` — Markdown certification report + capability-risk audit
- [x] richer `run` assertions — structured fields, latency budgets, secret-leak
- [x] `valid_output` — deterministic JSON-Schema validation of a tool's real structured output against its declared `outputSchema`
- [x] `mcpcert probe` — active adversarial fuzzing + injection/leak/crash analysis
- [x] threat-model-grounded **security grade** — six dimensions, blast-radius weighting, confirmed-exploit caps, `--probe`-backed; versioned rubric in [SCORING.md](./docs/SCORING.md)
- [x] library API (`import { ... } from "mcpcert"`) + Watchtower (self-hostable drift monitor)
- [x] JUnit + **SARIF** reporters + GitHub Action — `mcpcert sarif` for code-scanning
- [x] advisory semantic drift (`diff --semantic`) — local embedding model, off the deterministic path
- [ ] auth / transport security checks for remote (HTTP) servers
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
