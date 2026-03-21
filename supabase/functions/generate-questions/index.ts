import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// generate-questions — create interview questions for a mock session
// Uses Gemini Flash (fast, cheap) to generate contextual questions.
// Falls back gracefully if API key is missing.
// ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert interview coach and question designer.
Generate realistic, challenging interview questions that mirror real interview experiences.
Always respond with valid JSON only.`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const {
      interview_type   = "behavioural",
      experience_level = "mid",
      company          = null,
      role             = null,
      question_count   = 5,
      resume_context   = null,
      jd_context       = null,
    } = await req.json();

    const companyCtx    = company    ? `Target company: ${company}.` : "";
    const roleCtx       = role       ? `Target role: ${role}.` : "";
    const resumeCtx     = resume_context ? `Candidate background: ${JSON.stringify(resume_context).slice(0, 600)}` : "";
    const jdCtx         = jd_context     ? `Job description key points: ${JSON.stringify(jd_context).slice(0, 400)}` : "";
    const levelCtx      = experience_level ? `Experience level: ${experience_level}.` : "";

    const typeGuidance: Record<string, string> = {
      behavioural:   "Behavioural questions using the STAR format (Tell me about a time…). Focus on real work experiences, leadership, conflict, failure, and success.",
      technical:     "Technical questions covering algorithms, data structures, system architecture, debugging, or language-specific concepts appropriate for the role.",
      system_design: "System design questions asking the candidate to architect scalable distributed systems, APIs, databases, or large-scale services.",
      hr:            "HR and culture-fit questions about motivation, values, work style, salary expectations, career goals, and team dynamics.",
      mixed:         "A variety of question types: 2 behavioural, 2 technical or system design, and 1 HR/culture question.",
      product:       "Product management questions about product strategy, prioritisation, metrics, user empathy, and launch planning.",
      leadership:    "Leadership questions focusing on people management, influence, team building, conflict resolution, and organisational impact.",
    };

    const guidance = typeGuidance[interview_type] ?? typeGuidance.behavioural;
    const count    = Math.min(Math.max(1, question_count), 20);

    const prompt = `Generate exactly ${count} interview questions.

${guidance}
${levelCtx}
${companyCtx}
${roleCtx}
${resumeCtx}
${jdCtx}

Rules:
- Questions must feel authentic — like a real interviewer would ask them
- Vary difficulty (easy, medium, hard) across the set
- For behavioural, start with "Tell me about a time…" or "Describe a situation where…"
- For technical, be specific — name algorithms, patterns, or languages when relevant
- Make questions progressively more challenging

Return ONLY valid JSON with this exact shape:
{
  "questions": [
    {
      "question": "<the question text>",
      "type": "${interview_type}",
      "difficulty": "<easy|medium|hard>",
      "expected_duration_seconds": <60–300>,
      "tags": ["<tag1>", "<tag2>"],
      "order": <1-based index>
    }
  ]
}`;

    const raw  = await geminiGenerate(prompt, SYSTEM_PROMPT, 0.8, 2048);
    const data = parseJSON(raw, { questions: [] });

    // Ensure every question has an id and order
    const questions = (data.questions as any[]).map((q, i) => ({
      ...q,
      id:    crypto.randomUUID(),
      order: i + 1,
      type:  q.type ?? interview_type,
      expected_duration_seconds: q.expected_duration_seconds ?? 120,
      tags:  q.tags ?? [interview_type],
    }));

    return new Response(
      JSON.stringify({ questions, count: questions.length, generated_by: "gemini" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate-questions] error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to generate questions", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
