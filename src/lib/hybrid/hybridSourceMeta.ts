/** Hybrid backend source metadata surfaced on product UIs. */
export type HybridResponseSource =
  | "ai"
  | "python"
  | "deterministic"
  | "database"
  | "fallback";

const HYBRID_SOURCES = new Set<string>([
  "ai",
  "python",
  "deterministic",
  "database",
  "fallback",
]);

function asHybridSource(raw: unknown): HybridResponseSource | undefined {
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().toLowerCase();
  return HYBRID_SOURCES.has(normalized)
    ? (normalized as HybridResponseSource)
    : undefined;
}

/** Extract hybrid `source` from Edge payload, nested meta, or scoring fields. */
export function parseHybridSource(data: unknown): HybridResponseSource | undefined {
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;

  const direct = asHybridSource(obj.source);
  if (direct) return direct;

  const meta = obj.meta;
  if (meta && typeof meta === "object") {
    const fromMeta = asHybridSource((meta as Record<string, unknown>).source);
    if (fromMeta) return fromMeta;
  }

  return (
    asHybridSource(obj.scoring_source) ??
    asHybridSource(obj.hybrid_source) ??
    undefined
  );
}

/** Short label for UI — matches prep draft badge tone. */
export function hybridSourceLabel(
  source: HybridResponseSource | string | undefined | null,
): string | null {
  if (!source) return null;
  switch (source) {
    case "ai":
      return "AI";
    case "python":
      return "AI unavailable";
    case "deterministic":
      return "AI unavailable";
    case "database":
      return "Database";
    case "fallback":
      return "Fallback";
    default:
      return String(source);
  }
}

/** True when coach chat came from a non-AI hybrid path (degraded). */
export function isDegradedCoachSource(
  source: HybridResponseSource | string | undefined | null,
): boolean {
  return source === "python" || source === "deterministic" || source === "fallback";
}
