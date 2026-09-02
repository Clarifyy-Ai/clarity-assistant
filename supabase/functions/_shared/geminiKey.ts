/**
 * Gemini API key validation (standard AIza… and auth AQ.… keys).
 */

export function geminiKeyLooksValid(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v || v.length < 20) return false;
  return (
    /^AIza[0-9A-Za-z_-]{20,}$/.test(v) ||
    /^AQ\.[A-Za-z0-9_-]{20,}$/.test(v)
  );
}

export function resolveGeminiApiKey(): string {
  return (
    Deno.env.get("GEMINI_API_KEY") ??
    Deno.env.get("GOOGLE_AI_API_KEY") ??
    ""
  ).trim();
}

/** Lightweight live probe — does not log the key. */
export async function probeGeminiApiKey(
  apiKey: string,
  model = "gemini-flash-latest",
): Promise<boolean> {
  if (!geminiKeyLooksValid(apiKey)) return false;
  const version = Deno.env.get("GEMINI_API_VERSION") ?? "v1beta";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 8 },
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
