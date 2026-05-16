import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

const FN = "generate-questions";

const SYSTEM_PROMPT = `
You are an expert interview coach.
Return valid JSON only.
`;

function sanitize(value: any, limit = 200): string {
  return String(value ?? "")
    .replace(/[^\w\s.,?!\-+()/:]/g, "")
    .slice(0, limit)
    .trim();
}

function withTimeout<T>(promise: Promise<T>, ms = 22000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
}

async function retry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }

  throw lastError;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = {
    ...getCorsHeaders(req),
    "Content-Type": "application/json",
  };

  const requestId = crypto.randomUUID();

  try {
    const db = createServiceClient();

    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized",
          request_id: requestId,
        }),
        { status: 401, headers }
      );
    }

    const token = authHeader.replace(/^bearer\s+/i, "");

    const {
      data: { user },
      error: userErr,
    } = await db.auth.getUser(token);

    if (userErr || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized",
          request_id: requestId,
        }),
        { status: 401, headers }
      );
    }

    const body = await req.json().catch(() => null);

    if (!body) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid request body",
          request_id: requestId,
        }),
        { status: 400, headers }
      );
    }

    const interview_type = sanitize(body.interview_type || "behavioural", 40);
    const company = sanitize(body.company, 100);
    const role = sanitize(body.role, 100);

    let question_count = Number(body.question_count ?? 5);
    if (Number.isNaN(question_count)) question_count = 5;
    question_count = Math.min(Math.max(question_count, 1), 20);

    const credit = await deductCredits(
      user.id,
      "generate_questions",
      3
    );

    if (!credit.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Insufficient credits",
          request_id: requestId,
        }),
        { status: 402, headers }
      );
    }

    const prompt = `
Generate exactly ${question_count} interview questions.

Company: ${company}
Role: ${role}
Type: ${interview_type}

Return JSON:
{
  "questions": [
    {
      "question": "",
      "difficulty": "easy",
      "type": "",
      "tags": []
    }
  ]
}
`;

    let raw = "";

    try {
      raw = await withTimeout(
        retry(() =>
          geminiGenerate(prompt, SYSTEM_PROMPT, 0.7, 2048)
        ),
        22000
      );
    } catch (err) {
      // Refund on AI failure
      try {
        await deductCredits(
          user.id,
          "refund_generate_questions",
          -3
        );
      } catch {
        // ignore refund failure; do not crash request
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: "AI unavailable. Credits refunded.",
          request_id: requestId,
        }),
        { status: 502, headers }
      );
    }

    const parsed = parseJSON(raw, { questions: [] });

    // Remove duplicates safely
    const seen = new Set<string>();

    const cleaned = Array.isArray(parsed.questions)
      ? parsed.questions
          .map((q: any, idx: number) => {
            const text = sanitize(q?.question, 500);
            if (text.length <= 10) return null;

            // de-dupe identical questions
            const key = text.toLowerCase();
            if (seen.has(key)) return null;
            seen.add(key);

            const difficulty = sanitize(q?.difficulty, 20) || "medium";
            const type = sanitize(q?.type, 40) || interview_type;

            const tags = Array.isArray(q?.tags)
              ? q.tags.map((t: any) => sanitize(t, 40)).filter(Boolean)
              : [];

            return {
              id: crypto.randomUUID(),
              question_text: text, // ✅ preferred key in most of your frontend
              question: text,      // ✅ backward compat for any old callers
              difficulty,
              type,
              tags,
              order: idx + 1,
            };
          })
          .filter(Boolean)
      : [];

    return new Response(
      JSON.stringify({
        success: true,
        request_id: requestId,
        data: {
          questions: cleaned,
          count: cleaned.length,
        },
        // ✅ IMPORTANT: top-level questions so callers like
        // supabase.functions.invoke() + data.questions work
        questions: cleaned,
        count: cleaned.length,
      }),
      { headers }
    );
  } catch (err) {
    console.error(`[${FN}]`, { requestId, err });

    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        request_id: requestId,
      }),
      { status: 500, headers }
    );
  }
});
