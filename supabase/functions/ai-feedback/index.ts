// supabase/functions/ai-feedback/index.ts — PRODUCTION READY (ALL FEATURES PRESERVED)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { 
  requireAuth, 
  parseBody, 
  errorResponse, 
  deductCredits, 
  callAI, 
  getAdminClient, 
  log 
} from "../_shared/utils.ts";
import { parseJSON } from "../_shared/gemini.ts";

const SYSTEM_PROMPT = `
You are an expert interview coach.
Provide structured, actionable, JSON-only feedback.
Never output markdown or commentary.
Be concise, constructive, and professional.
Always return strictly valid JSON following the provided schema.
`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "ai-feedback";

  try {
    /* ------------------------
       AUTHENTICATE USER
    ------------------------ */
    const auth = await requireAuth(req);
    const userId = auth.userId;
    const db = getAdminClient();

    /* ------------------------
       PARSE BODY
    ------------------------ */
    const body = await parseBody<any>(req);
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
    } = body;

    if (!question || !transcript) {
      return errorResponse("Missing question or transcript", "INVALID_REQUEST", 400);
    }

    // Sanitize sizes exactly as original
    const safeQuestion = String(question).slice(0, 1000);
    const safeTranscript = String(transcript).slice(0, 3000);
    const safeResume = String(resume_text ?? "").slice(0, 1000);

    /* ------------------------
       VALIDATE SESSION BELONGS TO USER
    ------------------------ */
    const { data: sessionRow, error: sessionErr } = await db
      .from("sessions")
      .select("id, user_id, status")
      .eq("id", session_id)
      .single();

    if (sessionErr || !sessionRow || sessionRow.user_id !== userId) {
      return errorResponse("Invalid session", "FORBIDDEN", 403);
    }

    if (sessionRow.status !== "active") {
      return errorResponse("Session not active", "INVALID_STATE", 400);
    }

    /* ------------------------
       VALIDATE ANSWER BELONGS TO USER (If provided)
    ------------------------ */
    if (answer_id) {
      const { data: answerRow, error: answerErr } = await db
        .from("session_answers")
        .select("id, user_id")
        .eq("id", answer_id)
        .single();

      if (answerErr || !answerRow || answerRow.user_id !== userId) {
        return errorResponse("Answer not found", "FORBIDDEN", 403);
      }
    }

    /* ------------------------
       CREDIT DEDUCTION
    ------------------------ */
    const credit = await deductCredits(userId, "generate_feedback", 1);
    if (!credit.success) {
      return errorResponse("Not enough credits", "INSUFFICIENT_CREDITS", 402);
    }

    /* ------------------------
       BUILD PROMPT
    ------------------------ */
    const prompt = `
Interview type: ${interview_type ?? "behavioural"}
Target company: ${target_company ?? "unspecified"}

Question: ${safeQuestion}
Candidate answer: ${safeTranscript}

Speaking metrics:
- WPM: ${wpm ?? "unknown"}
- Filler words: ${filler_count ?? 0}

Resume context: ${safeResume || "None"}

Return ONLY valid JSON matching EXACTLY this structure:
{
  "score": 0,
  "content_score": 0,
  "structure_score": 0,
  "communication_score": 0,
  "confidence_score": 0,
  "feedback": "",
  "strengths": [],
  "improvements": [],
  "star_breakdown": {
    "situation": "",
    "task": "",
    "action": "",
    "result": ""
  },
  "model_answer": "",
  "sentiment": "neutral"
}
`;

    /* ------------------------
       CALL AI
    ------------------------ */
    const aiResult = await callAI({
      model: "gpt-4o-mini", // Better for complex JSON schema adherence
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      maxTokens: 1500,
      temperature: 0.3,
    });

    /* ------------------------
       STRICT JSON PARSE
    ------------------------ */
    const feedback = parseJSON(aiResult.text, null);

    if (!feedback) {
      // Refund on failure
      await deductCredits(userId, "refund_generate_feedback" as any, -1);
      return errorResponse("AI returned invalid JSON", "AI_ERROR", 500);
    }

    /* ------------------------
       SAVE FEEDBACK TO DB
    ------------------------ */
    if (answer_id) {
      const { error: updateErr } = await db
        .from("session_answers")
        .update({
          score: feedback.score,
          content_score: feedback.content_score,
          structure_score: feedback.structure_score,
          communication_score: feedback.communication_score,
          confidence_score: feedback.confidence_score,
          ai_feedback: feedback.feedback,
          model_answer: feedback.model_answer,
          star_breakdown: feedback.star_breakdown,
          sentiment: feedback.sentiment,
        })
        .eq("id", answer_id);

      if (updateErr) log(FN, "error", "Failed to update DB", updateErr);
    }

    log(FN, "info", "Feedback generated successfully", { userId, answer_id });

    return new Response(JSON.stringify(feedback), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "ai-feedback error", err);
    return errorResponse("Internal error", "INTERNAL_ERROR", 500);
  }
});
