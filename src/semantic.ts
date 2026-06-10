/**
 * ADVISORY semantic layer — the one place mcpcert uses a model, and it is kept
 * strictly off the deterministic path on purpose.
 *
 * The deterministic `diff` already flags that a tool description CHANGED, and
 * escalates to "suspicious" when the new text matches an injection pattern. What
 * it can't see is *meaning*: a description quietly rewritten from "reads a file"
 * to "reads a file and uploads it for review" is a textbook rug-pull, but it
 * trips no regex. This layer classifies a changed description as a benign reword,
 * a significant reword, or a capability expansion — using a tiny local embedding
 * model (all-MiniLM-L6-v2, ~23 MB, CPU, no API key, fully offline after the first
 * download).
 *
 * Hard rules:
 *   - It is OPT-IN (`diff --semantic`) and requires an optional dependency the
 *     core install never pulls in — so the deterministic product stays lean.
 *   - It is ADVISORY: it annotates, it never changes the certified verdict or the
 *     CI exit code. Determinism remains the product; this is a magnifying glass.
 *   - The decision logic (classifyPair / cosineSim / addedCapabilities) is PURE
 *     and unit-tested; only embedText() touches the model, and that is never run
 *     in CI.
 */
import type { DriftReport, Snapshot } from "./drift.js";
import { assessRisks, type RiskKind } from "./security.js";

/**
 * Below this cosine similarity, a reworded description is treated as a
 * "significant" change worth a human look. Calibrated for all-MiniLM-L6-v2,
 * where genuine paraphrases (incl. spelling variants) land ~0.70–0.85 and a real
 * topic/meaning shift drops below ~0.55. Heuristic and advisory — tune freely.
 */
export const SIM_THRESHOLD = 0.6;

export const SEMANTIC_MODEL = "Xenova/all-MiniLM-L6-v2";

export type SemanticKind = "benign-reword" | "significant-reword" | "capability-expansion";
export type Advisory = "info" | "warn" | "high";

export interface SemanticVerdict {
  kind: SemanticKind;
  advisory: Advisory;
  /** cosine similarity of the old vs new description embeddings, 0–1 */
  similarity: number;
  /** capability kinds present in the new text but not the old */
  addedCapabilities: RiskKind[];
  note: string;
}

export interface SemanticAnnotation {
  tool: string;
  oldText: string;
  newText: string;
  verdict: SemanticVerdict;
}

/** Pure: cosine similarity of two equal-length vectors. */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function capsOf(text: string): RiskKind[] {
  return assessRisks([{ name: "_", description: text }]).map((r) => r.risk);
}

/** Pure: capability kinds the new description implies that the old one did not. */
export function addedCapabilities(oldText: string, newText: string): RiskKind[] {
  const before = new Set(capsOf(oldText));
  return [...new Set(capsOf(newText))].filter((k) => !before.has(k));
}

/** Pure: classify a description change given the two texts and their similarity. */
export function classifyPair(input: { oldText: string; newText: string; similarity: number }): SemanticVerdict {
  const added = addedCapabilities(input.oldText, input.newText);
  if (added.length > 0) {
    return {
      kind: "capability-expansion",
      advisory: "high",
      similarity: input.similarity,
      addedCapabilities: added,
      note: `the description now implies a new capability (${added.join(", ")}) — review for a rug-pull`,
    };
  }
  if (input.similarity < SIM_THRESHOLD) {
    return {
      kind: "significant-reword",
      advisory: "warn",
      similarity: input.similarity,
      addedCapabilities: [],
      note: "meaning changed materially (low semantic similarity) — worth a human look",
    };
  }
  return {
    kind: "benign-reword",
    advisory: "info",
    similarity: input.similarity,
    addedCapabilities: [],
    note: "cosmetic change (high semantic similarity)",
  };
}

// ── model boundary (impure; never exercised in CI) ──────────────────────────

let extractorPromise: Promise<unknown> | null = null;

async function getExtractor(): Promise<(texts: string[], opts: unknown) => Promise<{ tolist(): number[][] }>> {
  if (!extractorPromise) {
    // Non-literal specifier so tsc does not try to resolve an optional dep that
    // the lean core never installs. Friendly error if the user hasn't opted in.
    const spec: string = "@huggingface/transformers";
    let mod: { pipeline: (task: string, model: string) => Promise<unknown> };
    try {
      mod = (await import(spec)) as typeof mod;
    } catch {
      throw new Error(
        "`--semantic` needs the optional local model runtime.\n" +
          "Install it once:  npm i @huggingface/transformers\n" +
          `(The ~23 MB ${SEMANTIC_MODEL} model downloads on first use and runs fully offline — no API key.)`,
      );
    }
    extractorPromise = mod.pipeline("feature-extraction", SEMANTIC_MODEL);
  }
  return extractorPromise as Promise<(texts: string[], opts: unknown) => Promise<{ tolist(): number[][] }>>;
}

/** Impure: embed texts with the local model. Lazily loads + caches the model. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

/**
 * Impure orchestration: for every description change in a drift report, embed the
 * old and new text and classify the change. Returns advisory annotations only.
 */
export async function annotateSemanticDrift(baseline: Snapshot, current: Snapshot, report: DriftReport): Promise<SemanticAnnotation[]> {
  const baseByName = new Map(baseline.tools.map((t) => [t.name, t]));
  const curByName = new Map(current.tools.map((t) => [t.name, t]));
  const targets = report.changes.filter((c) => c.kind === "description-changed" || c.kind === "suspicious");

  const annotations: SemanticAnnotation[] = [];
  for (const c of targets) {
    const oldText = baseByName.get(c.tool)?.description ?? "";
    const newText = curByName.get(c.tool)?.description ?? "";
    if (oldText === "" && newText === "") continue;
    const [a, b] = await embedTexts([oldText, newText]);
    const similarity = cosineSim(a, b);
    annotations.push({ tool: c.tool, oldText, newText, verdict: classifyPair({ oldText, newText, similarity }) });
  }
  return annotations;
}
