/** Client-side hint for which backend should run the paper job. */
export type PaperGeneratorPreference = "auto" | "edge" | "python";

/**
 * Suggest a generator preference to send with create-exam-paper.
 * Server remains authoritative; "auto" lets Edge/Python routing use workload rules.
 */
export function pickPaperGeneratorPreference(input: {
  mode: string;
  questionCount: number;
  available?: number;
  /** UI basis from GenerateGovPaper */
  basis?: "full_sim" | "custom" | "topic" | "official_previous" | "hybrid";
}): PaperGeneratorPreference {
  if (input.basis === "topic") return "edge";

  const requested = Math.max(0, Math.floor(input.questionCount));
  const available = Math.max(0, Math.floor(input.available ?? 0));
  const aiNeeded = Math.max(0, requested - available);

  if (input.mode === "official_previous" || input.basis === "official_previous" || aiNeeded === 0) {
    return "edge";
  }

  if (input.basis === "full_sim" || input.basis === "hybrid" || requested >= 50 || aiNeeded >= 15) {
    return "auto";
  }

  if (requested <= 20 && aiNeeded <= 10) {
    return "edge";
  }

  return "auto";
}

export function generatorLabel(generator?: string | null): string {
  switch (String(generator ?? "").toLowerCase()) {
    case "python_paper_factory":
    case "python":
    case "factory":
      return "Python worker";
    case "edge_assembler":
    case "edge":
      return "Edge";
    default:
      return "Auto";
  }
}
