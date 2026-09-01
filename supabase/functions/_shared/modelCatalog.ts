// Preference-ordered text models for Gemini / OpenAI / Anthropic.
// Live discovery filters this list to IDs the project key can actually call.
// Do not invent undocumented IDs — unknown live IDs are ranked, not hardcoded.

export type CatalogProvider = "gemini" | "openai" | "anthropic";

export const DEFAULT_TEXT_MODEL = "gemini-2.5-flash";

/** Cheap/fast first, then paid/pro. Preview/exp stay last. */
export const GEMINI_TEXT_MODELS: readonly string[] = [
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-pro",
  "gemini-pro-latest",
  "gemini-3.1-pro-preview",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

export const OPENAI_TEXT_MODELS: readonly string[] = [
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4.1",
  "gpt-4-turbo",
];

export const ANTHROPIC_TEXT_MODELS: readonly string[] = [
  "claude-3-haiku-20240307",
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20241022",
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
];

/** App / profile slug → API model id */
export const APP_TO_API: Record<string, string> = {
  "gemini-flash": "gemini-2.5-flash",
  "gemini-pro": "gemini-2.5-pro",
  "gemini-2.0-flash": "gemini-2.0-flash",
  "gemini-2.0-flash-lite": "gemini-2.0-flash-lite",
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
  "gemini-2.5-pro": "gemini-2.5-pro",
  "gemini-flash-latest": "gemini-flash-latest",
  "gemini-1.5-pro": "gemini-2.5-pro",
  "gemini-1.5-flash": "gemini-2.5-flash",
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-4.1": "gpt-4.1",
  "gpt-4.1-mini": "gpt-4.1-mini",
  "gpt-4-turbo": "gpt-4-turbo",
  claude: "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
  "claude-3-haiku": "claude-3-haiku-20240307",
  "claude-3-5-haiku": "claude-3-5-haiku-20241022",
};

export const MAX_MODELS_PER_PROVIDER = 3;
export const MAX_FALLBACK_MODELS = 9;

export function stripModelPrefix(id: string): string {
  return id.trim().replace(/^models\//, "");
}

export function providerForModel(model: string): CatalogProvider | null {
  const id = stripModelPrefix(model).toLowerCase();
  if (
    id.startsWith("gpt-") ||
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("o4") ||
    id.startsWith("chatgpt")
  ) {
    return "openai";
  }
  if (id.startsWith("claude")) return "anthropic";
  if (id.startsWith("gemini")) return "gemini";
  return null;
}

export function isTextGenerationModel(model: string): boolean {
  const n = stripModelPrefix(model).toLowerCase();
  if (!n) return false;
  if (
    /(embed|imagen|^image-|image-preview|-image$|-image-|tts|whisper|audio|realtime|transcribe|moderation|dall-e|veo|computer-use)/i
      .test(n)
  ) {
    return false;
  }
  return providerForModel(n) !== null;
}

export function rankTextModel(model: string): number {
  const id = stripModelPrefix(model);
  const catalogs: Record<CatalogProvider, readonly string[]> = {
    gemini: GEMINI_TEXT_MODELS,
    openai: OPENAI_TEXT_MODELS,
    anthropic: ANTHROPIC_TEXT_MODELS,
  };
  const provider = providerForModel(id);
  if (provider) {
    const idx = catalogs[provider].indexOf(id);
    if (idx >= 0) return idx;
  }
  const n = id.toLowerCase();
  if (n.includes("preview") || n.includes("-exp") || n.includes("experimental")) {
    return 200;
  }
  if (n.includes("lite") || n.includes("mini") || n.includes("haiku")) return 40;
  if (n.includes("flash")) return 50;
  if (n.includes("pro") || n.includes("sonnet") || n.includes("gpt-4")) return 80;
  return 120;
}

export function mapAppModelToApi(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_TEXT_MODEL;
  return APP_TO_API[trimmed] ?? stripModelPrefix(trimmed);
}

export function mergeAvailable(
  preferred: readonly string[],
  available: ReadonlySet<string> | null | undefined,
): string[] {
  if (!available || available.size === 0) return [...preferred];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of preferred) {
    if (available.has(id) && !seen.has(id) && isTextGenerationModel(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  const extras = [...available]
    .filter((id) => !seen.has(id) && isTextGenerationModel(id))
    .sort((a, b) => rankTextModel(a) - rankTextModel(b) || a.localeCompare(b));
  for (const id of extras) {
    out.push(id);
    seen.add(id);
  }
  return out;
}

export interface FallbackKeys {
  gemini?: boolean;
  openai?: boolean;
  anthropic?: boolean;
}

export interface AvailableByProvider {
  gemini?: ReadonlySet<string> | null;
  openai?: ReadonlySet<string> | null;
  anthropic?: ReadonlySet<string> | null;
}

function take(models: string[], limit: number): string[] {
  return models.slice(0, Math.max(0, limit));
}

function providerModels(
  provider: CatalogProvider,
  available: AvailableByProvider | undefined,
): string[] {
  const preferred =
    provider === "gemini"
      ? GEMINI_TEXT_MODELS
      : provider === "openai"
        ? OPENAI_TEXT_MODELS
        : ANTHROPIC_TEXT_MODELS;
  return mergeAvailable(preferred, available?.[provider]);
}

/**
 * Primary first, then other models of that provider, then remaining providers
 * (cheap → paid). Filtered to live-available IDs when the catalog was listed.
 */
export function buildFallbackChain(
  primary: string,
  keys: FallbackKeys,
  available?: AvailableByProvider,
): string[] {
  const mapped = mapAppModelToApi(primary || DEFAULT_TEXT_MODEL);
  const primaryProvider = providerForModel(mapped);
  const enabled: CatalogProvider[] = [];
  if (keys.gemini) enabled.push("gemini");
  if (keys.openai) enabled.push("openai");
  if (keys.anthropic) enabled.push("anthropic");

  const order: CatalogProvider[] = [];
  if (primaryProvider && enabled.includes(primaryProvider)) {
    order.push(primaryProvider);
  }
  for (const p of ["gemini", "openai", "anthropic"] as const) {
    if (!order.includes(p) && enabled.includes(p)) order.push(p);
  }

  const chain: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (!id || seen.has(id) || !isTextGenerationModel(id)) return;
    const provider = providerForModel(id);
    if (!provider || !keys[provider]) return;
    seen.add(id);
    chain.push(id);
  };

  if (primaryProvider && keys[primaryProvider]) push(mapped);

  for (const provider of order) {
    const rest = take(providerModels(provider, available), MAX_MODELS_PER_PROVIDER);
    for (const id of rest) {
      if (chain.length >= MAX_FALLBACK_MODELS) break;
      push(id);
    }
    if (chain.length >= MAX_FALLBACK_MODELS) break;
  }

  if (chain.length === 0 && keys.gemini) push(DEFAULT_TEXT_MODEL);
  return chain;
}
