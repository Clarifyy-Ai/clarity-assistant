export type PrepDraftKind = "input_based" | "ai_polished";
export type PrepResponseSource = "ai" | "python" | "deterministic";

export type PrepToolMeta = {
  draft_kind?: PrepDraftKind;
  source?: PrepResponseSource;
};

export function parsePrepToolMeta(data: unknown): PrepToolMeta {
  if (!data || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  const draftKind = obj.draft_kind;
  const source = obj.source;
  return {
    draft_kind:
      draftKind === "input_based" || draftKind === "ai_polished" ? draftKind : undefined,
    source:
      source === "ai" || source === "python" || source === "deterministic"
        ? source
        : undefined,
  };
}

/** Honest UI label — never claim "AI verified" for input-based or python drafts. */
export function prepDraftBadgeLabel(meta: PrepToolMeta): string | null {
  if (meta.draft_kind === "input_based" || meta.source === "python" || meta.source === "deterministic") {
    return "Input-based draft";
  }
  if (meta.draft_kind === "ai_polished") {
    return "AI polished";
  }
  return null;
}

export function isInputBasedPrepDraft(meta: PrepToolMeta): boolean {
  return (
    meta.draft_kind === "input_based" ||
    meta.source === "python" ||
    meta.source === "deterministic"
  );
}
