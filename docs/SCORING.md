# mcpcert scoring rubric

**Rubric version: `1.0`**

The MCP Cert Score is a single number from 0–100, but it is **not** a sum of
arbitrary check points. It is a penalty model grounded in a threat model for what
can go wrong when an AI agent connects to an MCP server. This document is the
contract: every weight the engine uses is written down here, and the engine
(`src/grade.ts`) is the executable copy of it.

Two scans are only comparable when their rubric version matches.

## Why a server is risky

An MCP server hands an agent a set of tools. The agent will call those tools with
model-generated arguments and feed the results back into its own context. That
creates five distinct ways to get hurt, plus the baseline question of whether the
server works at all:

| Dimension | Threat it measures | Weight |
| --- | --- | ---: |
| **Protocol conformance** | Does it speak MCP at all? An unreachable server or a broken `tools/list` is unusable. | 20% |
| **Interface quality** | Loose, untyped, undocumented schemas → the agent misuses tools and the input attack surface widens. | 15% |
| **Injection resistance** | A tool *description* that says "ignore previous instructions" (tool poisoning), or a tool that reflects an injected instruction back into the agent (indirect injection). | 20% |
| **Input robustness** | Does it handle malformed / oversized / wrong-type input gracefully, or crash / accept garbage (DoS)? | 15% |
| **Confidentiality** | Does it leak secrets — in a description or, worse, in a tool result at runtime? | 15% |
| **Exploitation** | Confirmed active exploits: command execution, path traversal, SSRF to cloud metadata. | 15% |

Weights sum to 100%. They are **renormalised across the dimensions we actually
assessed** (see "Honesty" below), so a passive scan is averaged only over the
dimensions it had evidence for.

## How a dimension is scored

Each dimension starts at **100** and loses points per finding, by severity:

| Severity | Penalty |
| --- | ---: |
| critical | 60 |
| high | 35 |
| medium | 18 |
| low | 7 |

A dimension floors at 0. The overall score is the weighted average of the
assessed dimensions — **then** the caps below are applied.

### Blast-radius weighting

The same flaw is not equally dangerous on every tool. A weak-validation finding on
`delete_file` matters far more than on `get_weather`. So each penalty is
multiplied by the blast radius of the tool it was found on:

| Capability | Multiplier |
| --- | ---: |
| shell-exec, destructive, credentials | ×2.0 |
| filesystem-write, network | ×1.5 |
| everything else | ×1.0 |

Capability is classified deterministically from the tool name + description
(`src/security.ts`). So a medium-severity (18) weak-validation finding on a
destructive tool costs 36 points, not 18.

## Caps — one critical dominates

A real security review does not average away a remote-code-execution bug because
the rest of the server is tidy. Neither do we. When one of these is present, it
sets a **ceiling on the whole score**, and the lowest ceiling wins:

| Trigger | Ceiling |
| --- | ---: |
| Confirmed exploit (command-exec / path-traversal / SSRF) | 15 |
| Server unreachable / handshake failed | 25 |
| Secret leaked (in a description or a runtime result) | 40 |
| Server crashed on adversarial input | 45 |
| Poisoned tool description / injected instruction reflected | 55 |

## Certification

A server is **Certified** only when all four hold:

1. score ≥ 80, **and**
2. no cap was triggered, **and**
3. no critical or high-severity finding in any assessed dimension, **and**
4. no assessed dimension scores below 50 — one badly-failing dimension blocks the
   badge even if the weighted average is high.

A low or medium finding lowers the score but does not, by itself, block
certification — unless enough of them sink a single dimension below the floor.

## Honesty — "not assessed" is not "passed"

We never claim a server is robust on evidence we don't have.

- **Robustness** and **Exploitation** require an *active probe* (`mcpcert
  score --probe` or `mcpcert probe`). Without it they are reported as **not
  assessed** and excluded from the average — not silently scored 100.
- **Interface / Injection / Confidentiality** need a tool list to judge. A server
  that never returned one (or exposes no tools) leaves them **not assessed**.
- **Protocol conformance** is always assessed, because we always try to connect.

This means a passive `mcpcert score` is a *conformance grade*; a `--probe` run is a
*security grade*. The breakdown always states which one you're looking at
(`probed: yes/no`).

## Determinism

Every input to this rubric is produced by deterministic, pure code — protocol
checks, pattern lint, schema-driven fuzzing, and confirmed-exploit signature
matching. There is **no LLM anywhere in the scoring path**, by design: the score
must be reproducible in CI and never flaky, never dependent on a network call or
an API key. The same server on the same rubric version always yields the same
grade.
