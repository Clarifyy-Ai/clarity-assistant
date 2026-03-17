import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits, getUserId } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// ai-feedback — score + analyse a single session answer
// Called after MockSession submits each answer
// ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert interview coach who provides
structured, actionable feedback on interview answers. Be specific,
direct, and constructive. Always respond with valid JSON.`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const {
      question,
      transcript,
      interview_type,
      target_company,
      session_id,
      answer_id,
      wpm,
      filler_count,
      resume_text,
    } = await req.json();

    if (!transcript || !question) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `
You are scoring an interview answer. Analyse the response below.

**Interview type:** ${interview_type ?? "behavioural"}
**Target company:** ${target_company ?? "not specified"}
**Question:** ${question}
**Candidate's answer:** ${transcript}
**Speaking metrics:** WPM: ${wpm ?? "unknown"}, Filler words: ${filler_count ?? 0}
${resume_text ? `**Candidate's background (from resume):** ${resume_text.slice(0, 800)}` : ""}

Return ONLY valid JSON with this exact structure:
{
  "score": <0-100 integer>,
  "content_score": <0-100>,
  "structure_score": <0-100>,
  "communication_score": <0-100>,
  "confidence_score": <0-100>,
  "feedback": "<2-3 sentence overall feedback>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<improvement 1>", "<improvement 2>"],
  "star_breakdown": {
    "situation": "<did they set context? yes/no + note>",
    "task": "<did they define their role? yes/no + note>",
    "action": "<did they describe actions? yes/no + note>",
    "result": "<did they quantify results? yes/no + note>"
  },
  "model_answer": "<A brief 2-sentence model answer structure>",
  "sentiment": "<positive|neutral|negative>"
}`;

    const raw      = await geminiGenerate(prompt, SYSTEM_PROMPT, 0.3, 1500);
    const feedback = parseJSON(raw, {
      score:               60,
      content_score:       60,
      structure_score:     60,
      communication_score: 60,
      confidence_score:    60,
      feedback:            "Unable to parse feedback.",
      strengths:           [],
      improvements:        [],
      star_breakdown:      {},
      model_answer:        "",
      sentiment:           "neutral",
    });

    // Persist to session_answers if answer_id provided
    if (answer_id) {
      await db
        .from("session_answers")
        .update({
          score:               feedback.score,
          content_score:       feedback.content_score,
          structure_score:     feedback.structure_score,
          communication_score: feedback.communication_score,
          confidence_score:    feedback.confidence_score,
          ai_feedback:         feedback.feedback,
          model_answer:        feedback.model_answer,
          star_breakdown:      feedback.star_breakdown,
          sentiment:           feedback.sentiment,
        })
        .eq("id", answer_id);
    }

    return new Response(
      JSON.stringify(feedback),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("ai-feedback error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
