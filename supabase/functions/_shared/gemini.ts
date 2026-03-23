// ─────────────────────────────────────────────────────────────────
// Shared Gemini client helper
// ─────────────────────────────────────────────────────────────────

const GEMINI_API_KEY   = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE      = "https://generativelanguage.googleapis.com/v1beta";
const MODEL            = "gemini-1.5-flash";
const GEMINI_TIMEOUT_MS = 50_000;

export interface GeminiMessage {
  role:  "user" | "model";
  parts: { text: string }[];
}

export async function geminiGenerate(
  prompt:      string,
  systemPrompt?: string,
  temperature:   number = 0.7,
  maxTokens:     number = 2048,
): Promise<string> {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
    ...(systemPrompt
      ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
      : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(
      `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  controller.signal,
        body:    JSON.stringify(body),
      }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error: ${err}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function geminiChat(
  messages:    GeminiMessage[],
  systemPrompt?: string,
  temperature: number = 0.7,
): Promise<string> {
  const body = {
    contents: messages,
    generationConfig: { temperature, maxOutputTokens: 1024 },
    ...(systemPrompt
      ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
      : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(
      `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  controller.signal,
        body:    JSON.stringify(body),
      }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Gemini chat error: ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// Parse JSON from Gemini output safely.
// Handles: fenced code blocks (````json ... ```` or ```` ... ````),
// multiple code blocks (picks the last one), and leading/trailing prose.
export function parseJSON<T>(text: string, fallback: T): T {
  try {
    // 1. Try to extract from JSON fenced code blocks — all matches, take last
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gs;
    const codeBlocks: string[] = [];
    let cbMatch: RegExpExecArray | null;
    while ((cbMatch = codeBlockRegex.exec(text)) !== null) {
      codeBlocks.push(cbMatch[1].trim());
    }
    // Attempt each block from last to first (prefer later/outermost blocks)
    for (let i = codeBlocks.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(codeBlocks[i]) as T;
      } catch {
        // try next
      }
    }

    // 2. Strip leading prose — find first { or [ and try to parse from there
    const firstBrace   = text.indexOf("{");
    const firstBracket = text.indexOf("[");

    if (firstBrace === -1 && firstBracket === -1) {
      return JSON.parse(text) as T;
    }

    const startIdx =
      firstBrace === -1   ? firstBracket :
      firstBracket === -1 ? firstBrace   :
      Math.min(firstBrace, firstBracket);

    const trimmed = text.slice(startIdx);
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}
