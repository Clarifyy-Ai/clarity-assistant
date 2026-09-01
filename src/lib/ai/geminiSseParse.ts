/**
 * Parse Gemini streamGenerateContent SSE JSON (alt=sse).
 * Shared with Edge `_shared/geminiStream.ts` — keep algorithms in sync.
 */

type GeminiSsePart = { text?: string };
type GeminiSseCandidate = {
  content?: { parts?: GeminiSsePart[] };
};
type GeminiSsePayload = {
  candidates?: GeminiSseCandidate[];
  error?: { code?: number; message?: string };
};

export function parseGeminiSseData(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "[DONE]") return null;

  let payload: GeminiSsePayload;
  try {
    payload = JSON.parse(trimmed) as GeminiSsePayload;
  } catch {
    return null;
  }

  if (payload.error) {
    const code = payload.error.code ?? 500;
    const message = String(payload.error.message ?? "Gemini stream error").slice(0, 240);
    throw new Error(`Gemini SSE error (${code}): ${message}`);
  }

  const parts = payload.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const text = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("");
  return text.length > 0 ? text : null;
}
