// ai-feedback/index.ts  — FIXED VERSION

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

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

  const db = createServiceClient();

  try {
    /* ------------------------
       AUTHENTICATE USER
    ------------------------ */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const {
      data: { user },
      error: userErr,
    } = await db.auth.getUser(token);

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    /* ------------------------
       PARSE BODY
    ------------------------ */
    const body = await req.json();
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
      return new Response(
        JSON.stringify({ error: "Missing question or transcript" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Sanitize sizes
    const safeQuestion = String(question).slice(0, 1000);
    const safeTranscript = String(transcript).slice(0, 3000);
    const safeResume = String(resume_text ?? "").slice(0, 1000);

    /* ------------------------
       VALIDATE SESSION BELONGS TO USER
    ------------------------ */
    const { data: sessionRow } = await db
      .from("interview_sessions")
      .select("id, user_id, status")
      .eq("id", session_id)
      .single();

    if (!sessionRow || sessionRow.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    if (sessionRow.status !== "active") {
      return new Response(JSON.stringify({ error: "Session not active" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    /* ------------------------
       VALIDATE ANSWER BELONGS TO USER
    ------------------------ */
    if (answer_id) {
      const { data: answerRow } = await db
        .from("session_answers")
        .select("id, user_id")
        .eq("id", answer_id)
        .single();

      if (!answerRow || answerRow.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Answer not found" }), {
          status: 403,
          headers: corsHeaders,
        });
      }
    }

    /* ------------------------
       OPTIONAL: CREDIT DEDUCTION
    ------------------------ */
    // const credit = await deductCredits(user.id, "ai_feedback", 1);
    // if (!credit.success) {
    //   return new Response(JSON.stringify({ error: "Not enough credits" }), {
    //     status: 402,
    //     headers: corsHeaders,
    //   });
    // }

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
       CALL GEMINI
    ------------------------ */
    const raw = await geminiGenerate(prompt, SYSTEM_PROMPT, 0.3, 1500);

    /* ------------------------
       STRICT JSON PARSE
    ------------------------ */
    const feedback = parseJSON(raw, null);

    if (!feedback) {
      return new Response(
        JSON.stringify({ error: "AI returned invalid JSON" }),
        { status: 500, headers: corsHeaders }
      );
    }

    /* ------------------------
       SAVE FEEDBACK TO DB
    ------------------------ */
    if (answer_id) {
      await db
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
    }

    return new Response(JSON.stringify(feedback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-feedback error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
