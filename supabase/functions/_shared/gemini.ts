// ─────────────────────────────────────────────────────────────────
// Shared Gemini client helper
// ─────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta";
const MODEL          = "gemini-1.5-flash";

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

  const res = await fetch(
    `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    }
  );

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

  const res = await fetch(
    `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    }
  );

  if (!res.ok) throw new Error(`Gemini chat error: ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// Parse JSON from Gemini output safely
export function parseJSON<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/```json\s*([\s\S]*?)```/) ??
                  text.match(/\{[\s\S]*\}/) ??
                  text.match(/\[[\s\S]*\]/);
    return JSON.parse(match?.[1] ?? match?.[0] ?? text) as T;
  } catch {
    return fallback;
  }
}
