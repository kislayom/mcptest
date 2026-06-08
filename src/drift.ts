import { createHash } from "node:crypto";
import { lintTools, type Tool } from "./lint.js";
import { openClient } from "./transport.js";

export interface ToolFingerprint {
  name: string;
  description: string;
  schemaHash: string;
  descHash: string;
}

export interface Snapshot {
  target: string;
  capturedAt: string;
  tools: ToolFingerprint[];
}

export type ChangeKind = "added" | "removed" | "description-changed" | "schema-changed" | "suspicious";

export interface DriftChange {
  tool: string;
  kind: ChangeKind;
  detail: string;
}

export interface DriftReport {
  target: string;
  changes: DriftChange[];
  drifted: boolean;
  suspicious: boolean;
}

/** Connect, list tools, and capture a stable fingerprint of each. */
export async function snapshot(target: string): Promise<Snapshot> {
  const opened = await openClient(target);
  try {
    const res = await opened.client.listTools();
    const tools: Tool[] = res.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    return { target, capturedAt: new Date().toISOString(), tools: fingerprintTools(tools) };
  } finally {
    await opened.close();
  }
}

export function fingerprintTools(tools: Tool[]): ToolFingerprint[] {
  return tools
    .map((t) => ({
      name: t.name,
      description: t.description ?? "",
      schemaHash: sha(canonical(t.inputSchema ?? {})),
      descHash: sha(t.description ?? ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Compare a baseline snapshot to a current one. Structural and description
 * changes are reported deterministically; a description that newly looks like a
 * prompt-injection is escalated to "suspicious" — the rug-pull signal.
 */
export function diffSnapshots(baseline: Snapshot, current: Snapshot): DriftReport {
  const changes: DriftChange[] = [];
  const baseByName = new Map(baseline.tools.map((t) => [t.name, t]));
  const curByName = new Map(current.tools.map((t) => [t.name, t]));

  for (const t of current.tools) {
    if (!baseByName.has(t.name)) changes.push({ tool: t.name, kind: "added", detail: "new tool appeared" });
  }

  for (const base of baseline.tools) {
    const cur = curByName.get(base.name);
    if (!cur) {
      changes.push({ tool: base.name, kind: "removed", detail: "tool disappeared" });
      continue;
    }
    if (cur.schemaHash !== base.schemaHash) {
      changes.push({ tool: base.name, kind: "schema-changed", detail: "inputSchema changed" });
    }
    if (cur.descHash !== base.descHash) {
      const suspicious = lintTools([{ name: cur.name, description: cur.description, inputSchema: {} }]).some(
        (f) => f.kind === "injection" || f.kind === "secret",
      );
      changes.push({
        tool: base.name,
        kind: suspicious ? "suspicious" : "description-changed",
        detail: suspicious
          ? "description changed and now looks like a prompt-injection / rug-pull"
          : "description changed",
      });
    }
  }

  return { target: current.target, changes, drifted: changes.length > 0, suspicious: changes.some((c) => c.kind === "suspicious") };
}

function canonical(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sortKeys(obj[k])]));
  }
  return v;
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}
