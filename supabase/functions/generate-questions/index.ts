// generate-questions/index.ts — SECURE, FIXED VERSION

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

const SYSTEM_PROMPT = `
You are an expert interview coach and question designer.
Generate realistic, challenging interview questions.
Respond with valid JSON only.
`;

function sanitize(value: any, limit = 200): string {
  return String(value ?? "")
    .replace(/[^\w\s.,?!\-+()\/]/g, "")   // remove unsafe chars
    .slice(0, limit);
}

const typeGuidance: Record<string, string> = {
  behavioural:   "Behavioural (STAR format). Leadership, conflict, failures, successes.",
  technical:     "Technical: algorithms, data structures, debugging, systems.",
  system_design: "System design: scalable services, APIs, distributed systems.",
  hr:            "HR: values, culture-fit, motivation, team dynamics.",
  mixed:         "Mixed: 2 behavioural, 2 technical, 1 HR.",
  product:       "Product strategy, prioritisation, metrics, user empathy.",
  leadership:    "Leadership: people management, conflict resolution.",
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const db = createServiceClient();

    /* -------------------------------------------
       AUTHENTICATE USER
    ------------------------------------------- */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const { data: { user }, error: userErr } = await db.auth.getUser(token);

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: });
    }

    /* -------------------------------------------
       VALIDATE & SANITIZE BODY
    ------------------------------------------- */
    const body = await req.json().catch(() => null);

    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: });
    }

    const interview_type_raw   = sanitize(body.interview_type, 40) || "behavioural";
    const experience_level     = sanitize(body.experience_level, 40) || "mid";
    const company              = sanitize(body.company, 200);
    const role                 = sanitize(body.role, 200);
    const resume_context_raw   = sanitize(JSON.stringify(body.resume_context ?? ""), 600);
    const jd_context_raw       = sanitize(JSON.stringify(body.jd_context ?? ""), 400);

    // Normalize valid interview types
    const interview_type =
      typeGuidance.hasOwnProperty(interview_type_raw)
        ? interview_type_raw
        : "behavioural";

    let question_count = Number(body.question_count ?? 5);
    if (Number.isNaN(question_count)) question_count = 5;
    question_count = Math.min(Math.max(1, question_count), 20);

    /* -------------------------------------------
       CREDIT DEDUCTION (3 credits)
    ------------------------------------------- */
    const credit = await deductCredits(user.id, "generate_questions", 3);
    if (!credit.success) {
      return new Response(JSON.stringify({ error: "Insufficient credits" }), {
        status: 402,
        headers: });
    }

    /* -------------------------------------------
       BUILD SAFE PROMPT
    ------------------------------------------- */
    const prompt = `
Generate exactly ${question_count} interview questions.

Guidance: ${typeGuidance[interview_type]}
Experience: ${experience_level}
${company ? `Company: ${company}` : ""}
${role ? `Role: ${role}` : ""}
${resume_context_raw ? `Resume: ${resume_context_raw}` : ""}
${jd_context_raw ? `JD: ${jd_context_raw}` : ""}

Rules:
- Authentic questions
- Increase difficulty gradually
- No markdown
- JSON only

JSON format:
{
  "questions": [
    {
      "question": "",
      "type": "${interview_type}",
      "difficulty": "easy|medium|hard",
      "expected_duration_seconds": 120,
      "tags": [],
      "order": 1
    }
  ]
}
`;

    /* -------------------------------------------
       CALL GEMINI SAFELY
    ------------------------------------------- */
    const raw = await geminiGenerate(prompt, SYSTEM_PROMPT, 0.8, 2048);
    const parsed = parseJSON(raw, { questions: [] });

    const list: any[] = Array.isArray(parsed.questions) ? parsed.questions : [];

    /* -------------------------------------------
       CLEAN & VALIDATE GENERATED QUESTIONS
    ------------------------------------------- */
    const cleaned = list.map((q, idx) => ({
      id: crypto.randomUUID(),
      question: sanitize(q.question, 600),
      type: sanitize(q.type ?? interview_type, 40),
      difficulty: sanitize(q.difficulty ?? "medium", 20),
      expected_duration_seconds: Number(q.expected_duration_seconds ?? 120),
      tags: Array.isArray(q.tags) ? q.tags.map((t: any) => sanitize(t, 40)) : [interview_type],
      order: idx + 1,
    })).filter((q) => q.question.length > 10);

    if (cleaned.length === 0) {
      return new Response(
        JSON.stringify({ error: "AI returned no usable questions" }),
        { status: 500, headers: getCorsHeaders(req) }
      );
    }

    /* -------------------------------------------
       RETURN QUESTIONS (client stores them)
    ------------------------------------------- */
    return new Response(
      JSON.stringify({
        questions: cleaned,
        count: cleaned.length,
        generated_by: "gemini",
      }),
      { headers: { ..."Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[generate-questions] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
});
