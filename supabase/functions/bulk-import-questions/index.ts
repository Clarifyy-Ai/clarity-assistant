// bulk-import-questions
//
// Ingest endpoint for the external FastAPI scraper. Accepts a paper + its MCQs,
// upserts the exam_papers row, and inserts the questions in one call.
//
// Auth: header `x-ingest-key` MUST match the `INGEST_API_KEY` secret.
// This function is intentionally JWT-disabled because the caller is a
// server-side scraper, not a browser user.
//
// Body shape:
// {
//   "exam_type": "SSC Exams (CGL/CHSL)",   // canonical questions.exam_type value
//   "source_year": 2024,
//   "paper": {                              // optional — upserts exam_papers row
//     "exam_name": "SSC CGL Tier 1",
//     "session": "Sep",
//     "shift": "1",
//     "total_questions": 100,
//     "total_marks": 200,
//     "duration_minutes": 60,
//     "difficulty_level": "MEDIUM"
//   },
//   "questions": [
//     {
//       "question_text": "...",
//       "options": [{"label":"A","text":"..."}, ...],   // 4 entries
//       "correct_answer": "B",
//       "explanation": "...",
//       "subject": "Quant",
//       "topic": "Algebra",
//       "difficulty": "MEDIUM",
//       "image_url": "https://...",                     // optional
//       "latex_present": false                          // optional
//     }
//   ]
// }

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

type IncomingQuestion = {
  question_text?: unknown;
  options?: unknown;
  correct_answer?: unknown;
  explanation?: unknown;
  subject?: unknown;
  topic?: unknown;
  difficulty?: unknown;
  image_url?: unknown;
  latex_present?: unknown;
  marks_positive?: unknown;
  marks_negative?: unknown;
};

type PaperMeta = {
  exam_name?: unknown;
  session?: unknown;
  shift?: unknown;
  total_questions?: unknown;
  total_marks?: unknown;
  duration_minutes?: unknown;
  difficulty_level?: unknown;
};

const VALID_DIFFICULTY = new Set(["EASY", "MEDIUM", "HARD"]);
const VALID_ANSWER = new Set(["A", "B", "C", "D"]);

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function s(v: unknown, max = 2000): string {
  return String(v ?? "").slice(0, max).trim();
}

function normalizeDifficulty(v: unknown): "EASY" | "MEDIUM" | "HARD" {
  const u = String(v ?? "").toUpperCase();
  return VALID_DIFFICULTY.has(u) ? (u as "EASY" | "MEDIUM" | "HARD") : "MEDIUM";
}

function normalizeAnswer(v: unknown): "A" | "B" | "C" | "D" {
  const u = String(v ?? "").toUpperCase();
  return VALID_ANSWER.has(u) ? (u as "A" | "B" | "C" | "D") : "A";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, req);
  }

  // ── Auth: shared-secret header ───────────────────────────────────────────
  const expectedKey = Deno.env.get("INGEST_API_KEY")?.trim();
  if (!expectedKey) {
    return json(
      { error: "INGEST_API_KEY not configured on Supabase" },
      503,
      req,
    );
  }
  const providedKey = req.headers.get("x-ingest-key")?.trim();
  if (!providedKey || providedKey !== expectedKey) {
    return json({ error: "Forbidden" }, 403, req);
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, req);
  }
  if (!body) return json({ error: "Empty body" }, 400, req);

  const examType = s(body.exam_type, 120);
  const sourceYear = Number(body.source_year);
  const paper = (body.paper ?? null) as PaperMeta | null;
  const rawQuestions = Array.isArray(body.questions)
    ? (body.questions as IncomingQuestion[])
    : [];

  if (!examType) return json({ error: "exam_type is required" }, 400, req);
  if (!Number.isFinite(sourceYear) || sourceYear < 1990 || sourceYear > 2100) {
    return json({ error: "source_year must be a valid year" }, 400, req);
  }
  if (rawQuestions.length === 0) {
    return json({ error: "questions[] is required and non-empty" }, 400, req);
  }
  if (rawQuestions.length > 500) {
    return json({ error: "Max 500 questions per request" }, 400, req);
  }

  const db = createServiceClient();
  const systemUserId = Deno.env.get("SYSTEM_USER_ID")?.trim() || null;

  // ── Upsert exam_papers row (optional) ───────────────────────────────────
  let paperId: string | null = null;
  if (paper && paper.exam_name) {
    const paperRow = {
      exam_type: examType,
      exam_name: s(paper.exam_name, 200),
      year: sourceYear,
      session: paper.session ? s(paper.session, 60) : null,
      shift: paper.shift ? s(paper.shift, 20) : null,
      total_questions: Number(paper.total_questions) || rawQuestions.length,
      total_marks: Number(paper.total_marks) || null,
      duration_minutes: Number(paper.duration_minutes) || null,
      difficulty_level: paper.difficulty_level
        ? normalizeDifficulty(paper.difficulty_level)
        : null,
    };

    const { data: upserted, error: paperErr } = await db
      .from("exam_papers")
      .upsert(paperRow, { onConflict: "exam_type,exam_name,year,shift" })
      .select("id")
      .maybeSingle();

    if (paperErr) {
      console.error("[bulk-import-questions] exam_papers upsert:", paperErr.message);
      // continue — paper metadata is best-effort
    } else {
      paperId = upserted?.id ?? null;
    }
  }

  // ── Build & insert question rows ────────────────────────────────────────
  const rows = rawQuestions
    .filter((q) => typeof q.question_text === "string" && (q.question_text as string).trim().length > 5)
    .map((q) => {
      const options = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
      return {
        question_text: s(q.question_text, 4000),
        question_type: "MCQ",
        options,
        correct_answer: normalizeAnswer(q.correct_answer),
        explanation: q.explanation ? s(q.explanation, 4000) : "",
        subject: q.subject ? s(q.subject, 120) : "General",
        topic: q.topic ? s(q.topic, 120) : "PYQ",
        difficulty: normalizeDifficulty(q.difficulty),
        exam_type: examType,
        source: "Previous Year Paper",
        source_year: sourceYear,
        is_verified: true,
        is_public: true,
        uploaded_by: systemUserId,
        marks_positive: Number(q.marks_positive) || 4,
        marks_negative: Number(q.marks_negative) || 1,
        image_url: q.image_url ? s(q.image_url, 1000) : null,
        latex_present: Boolean(q.latex_present),
      };
    });

  if (rows.length === 0) {
    return json({ error: "No valid questions in payload" }, 400, req);
  }

  const { data: inserted, error: insertErr } = await db
    .from("questions")
    .insert(rows)
    .select("id");

  if (insertErr) {
    console.error("[bulk-import-questions] insert:", insertErr.message);
    return json({ error: `Insert failed: ${insertErr.message}` }, 500, req);
  }

  return json(
    {
      success: true,
      paper_id: paperId,
      inserted_count: inserted?.length ?? 0,
      skipped_count: rawQuestions.length - rows.length,
      exam_type: examType,
      source_year: sourceYear,
    },
    200,
    req,
  );
});
