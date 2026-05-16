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
    .slice(0, limit);
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
  let lastError;

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
        }),
        {
          status: 401,
          headers: {
            ...getCorsHeaders(req),
            "Content-Type": "application/json",
          },
        }
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
        }),
        {
          status: 401,
          headers: {
            ...getCorsHeaders(req),
            "Content-Type": "application/json",
          },
        }
      );
    }

    const body = await req.json().catch(() => null);

    if (!body) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid request body",
        }),
        {
          status: 400,
          headers: {
            ...getCorsHeaders(req),
            "Content-Type": "application/json",
          },
        }
      );
    }

    const interview_type = sanitize(
      body.interview_type || "behavioural",
      40
    );

    const company = sanitize(body.company, 100);
    const role = sanitize(body.role, 100);

    let question_count = Number(body.question_count ?? 5);

    if (Number.isNaN(question_count)) {
      question_count = 5;
    }

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
        }),
        {
          status: 402,
          headers: {
            ...getCorsHeaders(req),
            "Content-Type": "application/json",
          },
        }
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
      await deductCredits(
        user.id,
        "refund_generate_questions",
        -3
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "AI unavailable. Credits refunded.",
        }),
        {
          status: 502,
          headers: {
            ...getCorsHeaders(req),
            "Content-Type": "application/json",
          },
        }
      );
    }

    const parsed = parseJSON(raw, {
      questions: [],
    });

    const cleaned = Array.isArray(parsed.questions)
      ? parsed.questions
          .map((q: any, idx: number) => ({
            id: crypto.randomUUID(),
            question: sanitize(q.question, 500),
            difficulty: sanitize(q.difficulty, 20),
            type: sanitize(q.type, 40),
            tags: Array.isArray(q.tags)
              ? q.tags.map((t: any) => sanitize(t, 40))
              : [],
            order: idx + 1,
          }))
          .filter((q: any) => q.question.length > 10)
      : [];

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          questions: cleaned,
          count: cleaned.length,
        },
      }),
      {
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error(`[${FN}]`, err);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
      }),
      {
        status: 500,
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
        },
      }
    );
  }
});
