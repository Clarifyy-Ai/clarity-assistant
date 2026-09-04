export type PrepDraftKind = "input_based" | "ai_polished";
export type PrepResponseSource = "ai" | "python" | "deterministic";

export type PrepToolMeta = {
  draft_kind?: PrepDraftKind;
  source?: PrepResponseSource;
};

function normalizeDraftKind(value: unknown): PrepDraftKind | undefined {
  if (value === "input_based") return "input_based";
  // Edge star_method AI success historically emits draft_kind: "polished".
  if (value === "ai_polished" || value === "polished") return "ai_polished";
  return undefined;
}

function normalizeSource(value: unknown): PrepResponseSource | undefined {
  if (value === "ai" || value === "python" || value === "deterministic") {
    return value;
  }
  return undefined;
}

export function parsePrepToolMeta(data: unknown): PrepToolMeta {
  if (!data || typeof data !== "object") return {};
  const obj = data as Record<string, unknown>;
  const nested =
    obj.meta && typeof obj.meta === "object" && !Array.isArray(obj.meta)
      ? (obj.meta as Record<string, unknown>)
      : null;

  const draftKind =
    normalizeDraftKind(obj.draft_kind) ??
    (nested ? normalizeDraftKind(nested.draft_kind) : undefined);
  const source =
    normalizeSource(obj.source) ??
    (nested ? normalizeSource(nested.source) : undefined);

  return {
    draft_kind: draftKind,
    source,
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
