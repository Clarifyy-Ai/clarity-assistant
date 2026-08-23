/**
 * Routes gov paper jobs to Edge assembler vs Python paper factory based on
 * caller preference and workload shape.
 */

import type { GenerationPlanKind, PaperGenerator } from "./govGenerationPlan.ts";

export type GeneratorPreference =
  | "auto"
  | "edge"
  | "python"
  | "edge_assembler"
  | "python_paper_factory";

const PYTHON_ALIASES = new Set([
  "python",
  "python_paper_factory",
  "factory",
  "py",
]);

const EDGE_ALIASES = new Set([
  "edge",
  "edge_assembler",
  "supabase",
  "deno",
]);

/** Read generator preference from create/check request body. */
export function parseGeneratorPreference(body: unknown): GeneratorPreference {
  if (!body || typeof body !== "object") return "auto";
  const record = body as Record<string, unknown>;

  const raw = String(record.generator ?? record.worker ?? "").trim().toLowerCase();
  if (raw && PYTHON_ALIASES.has(raw)) return "python";
  if (raw && EDGE_ALIASES.has(raw)) return "edge";
  if (raw === "auto" || raw === "") {
    if (record.preferPython === true || record.preferPythonFactory === true) {
      return "python";
    }
    if (record.preferPython === false || record.preferEdge === true) {
      return "edge";
    }
    return "auto";
  }

  return "auto";
}

export function isPythonPaperFactoryGenerator(value: unknown): boolean {
  const g = String(value ?? "").trim().toLowerCase();
  return PYTHON_ALIASES.has(g);
}

function readIntEnv(name: string, fallback: number): number {
  const env =
    typeof Deno !== "undefined"
      ? Deno.env.get(name)
      : (globalThis as { process?: { env?: Record<string, string | undefined> } })
          .process?.env?.[name];
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Pick the runtime after inventory/plan decisions.
 * Bank-only work always stays on Edge (fast, no long-running AI).
 */
export function resolvePaperGenerator(input: {
  kind: GenerationPlanKind;
  requested: number;
  aiContribution: number;
  skipAiFill: boolean;
  preference: GeneratorPreference;
  /** True when Supabase secret PAPER_FACTORY_WORKER=1 (Python worker deployed). */
  pythonWorkerEnabled: boolean;
}): PaperGenerator {
  if (input.kind === "bank_only" || input.skipAiFill || input.aiContribution <= 0) {
    return "edge_assembler";
  }

  if (input.preference === "edge" || input.preference === "edge_assembler") {
    return "edge_assembler";
  }

  if (
    input.preference === "python" ||
    input.preference === "python_paper_factory"
  ) {
    return input.pythonWorkerEnabled ? "python_paper_factory" : "edge_assembler";
  }

  // auto
  if (!input.pythonWorkerEnabled) {
    return "edge_assembler";
  }

  const minAi = readIntEnv("PAPER_FACTORY_MIN_AI_QUESTIONS", 15);
  const minRequested = readIntEnv("PAPER_FACTORY_MIN_REQUESTED", 50);

  if (
    input.aiContribution >= minAi ||
    (input.requested >= minRequested && input.aiContribution > 0)
  ) {
    return "python_paper_factory";
  }

  return "edge_assembler";
}
