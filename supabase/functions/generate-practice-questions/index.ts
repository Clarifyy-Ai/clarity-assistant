import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

// ---------------------------------------------
// SYSTEM PROMPT
// ---------------------------------------------
const SYSTEM_PROMPT = `
You are an expert competitive exam MCQ generator.
Create high-quality, error-free MCQs.
Always return strictly valid JSON.
`;

// Only allow safe characters in topic/subject
function sanitize(str: string): string {
  return String(str)
    .replace(/[^\w\s.,()+\-\/]/g, "")
    .slice(0, 120);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // ---------------------------------------------
    // AUTHENTICATE USER SAFELY
    // ---------------------------------------------
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";

    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const db = createServiceClient();

    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: });
    }

    // ---------------------------------------------
    // PARSE & VALIDATE INPUT
    // ---------------------------------------------
    const body = await req.json().catch(() => null);
    const rawTopic = sanitize(body?.topic ?? "");
    const rawSubject = sanitize(body?.subject ?? "");
    const rawExamType = sanitize(body?.exam_type ?? "");
    const difficulty = sanitize(body?.difficulty ?? "MEDIUM");

    if (!rawTopic || !rawSubject) {
      return new Response(
        JSON.stringify({ error: "Missing valid topic or subject" }),
        { status: 400, headers: getCorsHeaders(req) }
      );
    }

    // ---------------------------------------------
    // OPTIONAL: DEDUCT CREDITS (3 credits)
    // ---------------------------------------------
    const credit = await deductCredits(user.id, "generate_practice_questions", 3);
    if (!credit.success) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits" }),
        { status: 402, headers: getCorsHeaders(req) }
      );
    }

    // ---------------------------------------------
    // CHECK QUESTION COUNT (topic + subject)
    // ---------------------------------------------
    const { count } = await db
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("topic", rawTopic)
      .eq("subject", rawSubject)
      .eq("is_public", true);

    if ((count ?? 0) >= 20) {
      return new Response(
        JSON.stringify({
          success: true,
          generated: 0,
          message: "Topic already has sufficient questions",
        }),
        { headers: getCorsHeaders(req) }
      );
    }

    // ---------------------------------------------
    // GENERATE PROMPT
    // ---------------------------------------------
    const prompt = `
Generate exactly 10 high-quality MCQ questions.

Topic: ${rawTopic}
Subject: ${rawSubject}
Exam type: ${rawExamType || "General"}
Difficulty: ${difficulty}

Rules:
- Each question must have EXACTLY 4 options
- Options labeled A, B, C, D
- Include correct_answer as A|B|C|D
- Include explanation
- Difficulty distribution: EASY (2), MEDIUM (5), HARD (3)
- NO markdown, only JSON allowed

JSON Format:
{
  "questions": [
    {
      "question_text": "",
      "options": [
        {"label":"A","text":""},
        {"label":"B","text":""},
        {"label":"C","text":""},
        {"label":"D","text":""}
      ],
      "correct_answer": "A",
      "explanation": "",
      "difficulty": "MEDIUM",
      "marks_positive": 4,
      "marks_negative": 1
    }
  ]
}
`.trim();

    // ---------------------------------------------
    // CALL GEMINI (with error guard)
    // ---------------------------------------------
    const raw = await geminiGenerate(prompt, SYSTEM_PROMPT, 0.7, 3000);
    const generated = parseJSON(raw, { questions: [] });

    if (!Array.isArray(generated.questions) || generated.questions.length === 0) {
      return new Response(
        JSON.stringify({ error: "AI failed to generate questions" }),
        { status: 500, headers: getCorsHeaders(req) }
      );
    }

    // ---------------------------------------------
    // VALIDATE MCQ SCHEMA
    // ---------------------------------------------
    const cleaned = generated.questions
      .filter((q: any) =>
        q?.question_text &&
        Array.isArray(q?.options) &&
        q.options.length === 4 &&
        /^[A-D]$/.test(q.correct_answer)
      )
      .map((q: any) => ({
        question_text: String(q.question_text).slice(0, 500),
        question_type: "MCQ",
        options: q.options.map((opt: any) => ({
          label: opt.label,
          text: String(opt.text).slice(0, 200),
        })),
        correct_answer: q.correct_answer,
        explanation: String(q.explanation || "").slice(0, 500),
        subject: rawSubject,
        topic: rawTopic,
        difficulty: q.difficulty || difficulty,
        exam_type: rawExamType || null,
        source: "AI_GENERATED",
        marks_positive: q.marks_positive ?? 4,
        marks_negative: q.marks_negative ?? 1,
        is_verified: false,
        is_public: false, // FIXED: Do NOT auto-publish
        latex_present: /[=+\-*/]/.test(q.question_text),
      }));

    if (cleaned.length === 0) {
      return new Response(
        JSON.stringify({ error: "Validation failed: No valid questions" }),
        { status: 500, headers: getCorsHeaders(req) }
      );
    }

    // ---------------------------------------------
    // INSERT QUESTIONS
    // ---------------------------------------------
    const { error: insertErr } = await db.from("questions").insert(cleaned);
    if (insertErr) {
      console.error("[generate-practice-questions] DB insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to save questions" }),
        { status: 500, headers: getCorsHeaders(req) }
      );
    }

    return new Response(
      JSON.stringify({ success: true, generated: cleaned.length }),
      { headers: getCorsHeaders(req) }
    );

  } catch (err) {
    console.error("[generate-practice-questions] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
});
