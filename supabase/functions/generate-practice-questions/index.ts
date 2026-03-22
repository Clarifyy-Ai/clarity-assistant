import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// generate-practice-questions
// Verifies JWT, checks question count by topic; if below 20,
// generates 10 MCQ questions via Gemini and saves them.
// ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert question setter for Indian competitive exams (JEE, NEET, UPSC, SSC).
Generate high-quality, accurate MCQ questions. Always respond with valid JSON only.`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // ── Verify JWT ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const db = createServiceClient();

    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { topic, subject, exam_type = null, difficulty = "MEDIUM" } = await req.json();
    if (!topic || !subject) {
      return new Response(JSON.stringify({ error: "Missing topic or subject" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Count existing questions for this topic ───────────────────
    const { count } = await db
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("topic", topic)
      .eq("is_public", true);

    if ((count ?? 0) >= 20) {
      return new Response(
        JSON.stringify({ success: true, generated: 0, message: "Topic already has sufficient questions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `Generate exactly 10 multiple-choice questions for the following topic.

Topic: ${topic}
Subject: ${subject}
${exam_type ? `Exam: ${exam_type}` : ""}
Difficulty: ${difficulty}

Requirements:
- Each question must have exactly 4 options (A, B, C, D)
- Include the correct answer as the option letter (A, B, C, or D)
- Include a brief explanation
- Questions should be appropriate for competitive exam level
- Mix easy (2), medium (5), and hard (3) questions

Return ONLY valid JSON with this exact shape:
{
  "questions": [
    {
      "question_text": "<question text>",
      "options": [
        {"label": "A", "text": "<option text>"},
        {"label": "B", "text": "<option text>"},
        {"label": "C", "text": "<option text>"},
        {"label": "D", "text": "<option text>"}
      ],
      "correct_answer": "<A|B|C|D>",
      "explanation": "<brief explanation>",
      "difficulty": "<EASY|MEDIUM|HARD>",
      "marks_positive": 4,
      "marks_negative": 1
    }
  ]
}`;

    type GeneratedQuestion = {
      question_text: string;
      options: Array<{ label: string; text: string }>;
      correct_answer: string;
      explanation: string;
      difficulty?: string;
      marks_positive?: number;
      marks_negative?: number;
    };

    const raw = await geminiGenerate(prompt, SYSTEM_PROMPT, 0.7, 3000);
    const data = parseJSON(raw, { questions: [] }) as { questions: GeneratedQuestion[] };

    const questions = data.questions.map((q) => ({
      question_text: q.question_text,
      question_type: "MCQ",
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      subject,
      topic,
      difficulty: q.difficulty ?? difficulty,
      exam_type: exam_type,
      source: "AI_GENERATED",
      marks_positive: q.marks_positive ?? 4,
      marks_negative: q.marks_negative ?? 1,
      is_verified: false,
      is_public: true,
      latex_present: false,
    }));

    if (questions.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No questions generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: insertErr } = await db.from("questions").insert(questions);

    if (insertErr) {
      console.error("[generate-practice-questions] insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to save questions", detail: insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, generated: questions.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate-practice-questions] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
