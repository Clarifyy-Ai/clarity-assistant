// Live model listing for Gemini / OpenAI / Anthropic. Fail-open: if listing
// times out or errors, callers keep the static preference catalog.

import {
  isTextGenerationModel,
  providerForModel,
  stripModelPrefix,
  type AvailableByProvider,
} from "./modelCatalog.ts";

const TTL_MS = 10 * 60 * 1000;
const LIST_TIMEOUT_MS = 1_500;

type CacheEntry = {
  at: number;
  available: AvailableByProvider;
};

let cache: CacheEntry | null = null;
let inflight: Promise<AvailableByProvider> | null = null;

function envKey(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function geminiBase(): string {
  const version = Deno.env.get("GEMINI_API_VERSION") ?? "v1beta";
  return `https://generativelanguage.googleapis.com/${version}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = LIST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseGeminiIds(body: unknown): Set<string> {
  const models = (body as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> })
    ?.models;
  const out = new Set<string>();
  if (!Array.isArray(models)) return out;
  for (const row of models) {
    const id = stripModelPrefix(String(row?.name ?? ""));
    const methods = row?.supportedGenerationMethods ?? [];
    if (!id || !methods.includes("generateContent")) continue;
    if (!isTextGenerationModel(id)) continue;
    out.add(id);
  }
  return out;
}

function parseOpenAiIds(body: unknown): Set<string> {
  const rows = (body as { data?: Array<{ id?: string }> })?.data;
  const out = new Set<string>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const id = String(row?.id ?? "").trim();
    if (isTextGenerationModel(id) && providerForModel(id) === "openai") out.add(id);
  }
  return out;
}

function parseAnthropicIds(body: unknown): Set<string> {
  const rows = (body as { data?: Array<{ id?: string }> })?.data;
  const out = new Set<string>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const id = String(row?.id ?? "").trim();
    if (isTextGenerationModel(id) && providerForModel(id) === "anthropic") out.add(id);
  }
  return out;
}

async function listGemini(key: string): Promise<Set<string> | null> {
  try {
    const res = await fetchWithTimeout(`${geminiBase()}/models`, {
      headers: { "x-goog-api-key": key },
    });
    if (!res.ok) return null;
    return parseGeminiIds(await res.json());
  } catch {
    return null;
  }
}

async function listOpenAI(key: string): Promise<Set<string> | null> {
  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    return parseOpenAiIds(await res.json());
  } catch {
    return null;
  }
}

async function listAnthropic(key: string): Promise<Set<string> | null> {
  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) return null;
    return parseAnthropicIds(await res.json());
  } catch {
    return null;
  }
}

async function refreshAvailable(): Promise<AvailableByProvider> {
  const geminiKey = envKey("GEMINI_API_KEY");
  const openaiKey = envKey("OPENAI_API_KEY");
  const anthropicKey = envKey("ANTHROPIC_API_KEY");
  const [gemini, openai, anthropic] = await Promise.all([
    geminiKey ? listGemini(geminiKey) : Promise.resolve(null),
    openaiKey ? listOpenAI(openaiKey) : Promise.resolve(null),
    anthropicKey ? listAnthropic(anthropicKey) : Promise.resolve(null),
  ]);
  return { gemini, openai, anthropic };
}

export async function getAvailableModels(): Promise<AvailableByProvider> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.available;
  if (!inflight) {
    inflight = refreshAvailable()
      .then((available) => {
        cache = { at: Date.now(), available };
        return available;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function configuredProviderKeys(): {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
} {
  return {
    gemini: Boolean(envKey("GEMINI_API_KEY")),
    openai: Boolean(envKey("OPENAI_API_KEY")),
    anthropic: Boolean(envKey("ANTHROPIC_API_KEY")),
  };
}

export function resetModelAvailabilityCache(): void {
  cache = null;
  inflight = null;
}
