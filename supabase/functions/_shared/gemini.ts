// supabase/functions/_shared/gemini.ts — PRODUCTION READY, HARDENED VERSION

/* -------------------------------------------------------------------------- */
/*                               CONSTANTS                                     */
/* -------------------------------------------------------------------------- */

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta";
const MODEL          = "gemini-1.5-flash";
const TIMEOUT_MS     = 50_000;

if (!GEMINI_API_KEY) {
  console.warn("[gemini] Warning: GEMINI_API_KEY is not configured");
}

/* -------------------------------------------------------------------------- */
/*                                  TYPES                                      */
/* -------------------------------------------------------------------------- */

export interface GeminiPart {
  text: string;
}

export interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

/* -------------------------------------------------------------------------- */
/*                          INTERNAL FETCH WRAPPER                             */
/* -------------------------------------------------------------------------- */

async function geminiRequest(
  payload: Record<string, unknown>
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(
      `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown Gemini error");
    throw new Error(`Gemini API Error (${res.status}): ${errText}`);
  }

  const data = await res.json().catch(() => null);
  return data;
}

function extractTextFromGemini(data: any): string {
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.content?.parts?.[0]?.inlineData ??
    ""
  );
}

function sanitizePrompt(p: string, max = 10_000): string {
  return String(p ?? "")
    .replace(/[\u0000-\u0008]/g, "")
    .replace(/[\u000E-\u001F]/g, "")
    .slice(0, max);
}

/* -------------------------------------------------------------------------- */
/*                         GENERATE MODE (single prompt)                       */
/* -------------------------------------------------------------------------- */

export async function geminiGenerate(
  prompt: string,
  systemPrompt?: string,
  temperature = 0.7,
  maxTokens = 2048
): Promise<string> {
  const safePrompt = sanitizePrompt(prompt);
  const safeSystem = systemPrompt ? sanitizePrompt(systemPrompt) : undefined;

  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: safePrompt }]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens
    }
  };

  if (safeSystem) {
    payload.systemInstruction = { parts: [{ text: safeSystem }] };
  }

  const data = await geminiRequest(payload);
  return extractTextFromGemini(data);
}

/* -------------------------------------------------------------------------- */
/*                             CHAT MODE (multi-turn)                          */
/* -------------------------------------------------------------------------- */

export async function geminiChat(
  messages: GeminiMessage[],
  systemPrompt?: string,
  temperature = 0.7,
  maxTokens = 1024
): Promise<string> {
  const safeMessages = messages.map((m) => ({
    role: m.role,
    parts: m.parts.map((p) => ({
      text: sanitizePrompt(p.text)
    }))
  }));

  const payload: Record<string, unknown> = {
    contents: safeMessages,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens
    }
  };

  if (systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: sanitizePrompt(systemPrompt) }]
    };
  }

  const data = await geminiRequest(payload);
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

  // Try fenced blocks (from last → first)
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(blocks[i]) as T;
    } catch {}
  }

  // Strip leading prose
  const start = Math.min(
    input.indexOf("{") !== -1 ? input.indexOf("{") : Infinity,
    input.indexOf("[") !== -1 ? input.indexOf("[") : Infinity
  );

  if (start !== Infinity) {
    try {
      return JSON.parse(input.slice(start)) as T;
    } catch {}
  }

  // Attempt direct parsing
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}
