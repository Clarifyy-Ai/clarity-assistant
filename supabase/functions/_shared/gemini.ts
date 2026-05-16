// supabase/functions/_shared/gemini.ts — FIXED + PRODUCTION SAFE
// - Uses modern default model gemini-2.5-flash (configurable)
// - Supports per-request model override
// - Uses x-goog-api-key header auth
// - Optional API version via GEMINI_API_VERSION ("v1" recommended, "v1beta" default)
// - Robust text extraction (joins multiple parts)

const GEMINI_API_VERSION = Deno.env.get("GEMINI_API_VERSION") ?? "v1beta";
const GEMINI_BASE = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}`;
const DEFAULT_MODEL = Deno.env.get("GEMINI_MODEL_DEFAULT") ?? "gemini-2.5-flash";
const TIMEOUT_MS = 50_000;

function getServerGeminiKey(): string {
  return Deno.env.get("GEMINI_API_KEY") ?? "";
}

export interface GeminiPart {
  text: string;
}

export interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** Priority: BYOK key > server-side GEMINI_API_KEY */
function resolveGeminiKey(byokKey?: string): string {
  if (byokKey && byokKey.trim().length > 0) return byokKey.trim();
  return getServerGeminiKey();
}

function sanitizePrompt(p: string, max = 10_000): string {
  return String(p ?? "")
    .replace(/[\u0000-\u0008]/g, "")
    .replace(/[\u000E-\u001F]/g, "")
    .slice(0, max);
}

function extractTextFromGemini(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  if (!Array.isArray(parts)) return "";
  return parts.map((p: any) => p?.text ?? "").join("");
}

async function geminiRequest(
  payload: Record<string, unknown>,
  opts?: { byokKey?: string; model?: string; stream?: boolean }
): Promise<any> {
  const apiKey = resolveGeminiKey(opts?.byokKey);
  if (!apiKey) {
    throw new Error(
      "No Gemini API key available. Set GEMINI_API_KEY in Supabase Secrets " +
        "or pass a BYOK key via x-byok-gemini."
    );
  }

  const model = (opts?.model && opts.model.trim()) ? opts.model.trim() : DEFAULT_MODEL;
  const method = opts?.stream ? "streamGenerateContent" : "generateContent";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${GEMINI_BASE}/models/${model}:${method}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown Gemini error");
      throw new Error(`Gemini API Error (${res.status}): ${errText}`);
    }

    const data = await res.json().catch(() => {
      throw new Error("Gemini returned non-JSON response");
    });

    return data;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Gemini request timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/*                         GENERATE MODE (single prompt)                       */
/* -------------------------------------------------------------------------- */

export async function geminiGenerate(
  prompt: string,
  systemPrompt?: string,
  temperature = 0.7,
  maxTokens = 2048,
  byokKey?: string,
  model?: string
): Promise<string> {
  const safePrompt = sanitizePrompt(prompt);
  const safeSystem = systemPrompt ? sanitizePrompt(systemPrompt) : undefined;

  const payload: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: safePrompt }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };

  if (safeSystem) {
    payload.systemInstruction = { parts: [{ text: safeSystem }] };
  }

  const data = await geminiRequest(payload, { byokKey, model });
  return extractTextFromGemini(data);
}

/* -------------------------------------------------------------------------- */
/*                             CHAT MODE (multi-turn)                          */
/* -------------------------------------------------------------------------- */

export async function geminiChat(
  messages: GeminiMessage[],
  systemPrompt?: string,
  temperature = 0.7,
  maxTokens = 1024,
  byokKey?: string,
  model?: string
): Promise<string> {
  const safeMessages = messages.map((m) => ({
    role: m.role,
    parts: (m.parts ?? []).map((p) => ({ text: sanitizePrompt(p.text) })),
  }));

  const payload: Record<string, unknown> = {
    contents: safeMessages,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };

  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: sanitizePrompt(systemPrompt) }] };
  }

  const data = await geminiRequest(payload, { byokKey, model });
  return extractTextFromGemini(data);
}

/* -------------------------------------------------------------------------- */
/*                       ROBUST JSON PARSER FOR GEMINI                         */
/* -------------------------------------------------------------------------- */

export function parseJSON<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;

  const input = raw.trim();

  // Extract from fenced code blocks
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let block: RegExpExecArray | null;
  const blocks: string[] = [];

  while ((block = fenceRegex.exec(input)) !== null) {
    blocks.push(block[1].trim());
  }

  // Try fenced blocks (last → first)
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(blocks[i]) as T;
    } catch {
      /* ignore */
    }
  }

  // Strip leading prose and try from first { or [
  const start = Math.min(
    input.indexOf("{") !== -1 ? input.indexOf("{") : Infinity,
    input.indexOf("[") !== -1 ? input.indexOf("[") : Infinity
  );

  if (start !== Infinity) {
    try {
      return JSON.parse(input.slice(start)) as T;
    } catch {
      /* ignore */
    }
  }

  // Attempt direct parsing of full string
  try {
    return JSON.parse(input) as T;
  } catch {
    console.warn("[gemini] parseJSON failed. Raw snippet:", input.slice(0, 200));
    return fallback;
  }
}
