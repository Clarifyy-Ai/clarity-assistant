// supabase/functions/ai-coach-chat/index.ts — PRODUCTION READY (ALL FEATURES PRESERVED)

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { 
  requireAuth, 
  parseBody, 
  successResponse, 
  errorResponse, 
  deductCredits, 
  callAI, 
  getAdminClient, 
  log 
} from "../_shared/utils.ts";

const SYSTEM = `
You are an expert, empathetic interview coach.
You may NOT answer the interview question directly.
You MUST provide brief guidance (<100 words).
Be encouraging, structured, and practical.
Use bullet points for tips.
`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "ai-coach-chat";

  try {
    /* --------------------------
       AUTHENTICATE USER
    -------------------------- */
    const auth = await requireAuth(req);
    const userId = auth.userId;
    const db = getAdminClient();

    /* --------------------------
       READ BODY
    -------------------------- */
    const body = await parseBody<{
      session_id: string;
      question: string;
      transcript: string;
      user_message: string;
      history?: { role: string; text: string }[];
    }>(req);

    if (!body.session_id || !body.user_message) {
      return errorResponse("Missing required fields", "INVALID_REQUEST", 400);
    }

    /* --------------------------
       VALIDATE SESSION OWNERSHIP
    -------------------------- */
    const { data: sessionRow, error: sessionErr } = await db
      .from("sessions")
      .select("id, user_id, status")
      .eq("id", body.session_id)
      .single();

    if (sessionErr || !sessionRow || sessionRow.user_id !== userId) {
      return errorResponse("Session not found or not yours", "FORBIDDEN", 403);
    }

    if (sessionRow.status !== "active") {
      return errorResponse("Session not active", "INVALID_STATE", 400);
    }

    /* --------------------------
       CREDIT DEDUCTION
    -------------------------- */
    const credit = await deductCredits(userId, "coach_message", 1);
    if (!credit.success) {
      return errorResponse("Insufficient credits", "INSUFFICIENT_CREDITS", 402);
    }

    /* --------------------------
       SANITIZE INPUT (Preserved exact limits)
    -------------------------- */
    const safeUserMsg = String(body.user_message).slice(0, 2000);
    const safeTranscript = String(body.transcript ?? "").slice(0, 600);

    /* --------------------------
       BUILD CHAT HISTORY
    -------------------------- */
    const contextPrefix = `
Current interview question: "${body.question ?? "N/A"}"
Candidate's answer so far: "${safeTranscript}"

---
`;

    // Map history to standard AI format
    const messages = [
      { role: "system" as const, content: SYSTEM },
      { role: "user" as const, content: contextPrefix },
      { role: "assistant" as const, content: "I understand the question and your progress. How can I support your preparation?" },
      ...(body.history || []).slice(-6).map((m: any) => ({
        role: m.role === "coach" ? "assistant" as const : "user" as const,
        content: String(m.text).slice(0, 1000),
      })),
      { role: "user" as const, content: safeUserMsg },
    ];

    /* --------------------------
       CALL AI (Unified)
    -------------------------- */
    const aiResult = await callAI({
      model: "gemini-1.5-pro",
      messages,
      maxTokens: 1024,
      temperature: 0.6,
    });

    log(FN, "info", "Coach reply generated", { userId, tokens: aiResult.totalTokens });

    // Preserved exact original response format
    return new Response(JSON.stringify({ reply: aiResult.text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "Coach chat error", err);
    return new Response(
      JSON.stringify({
        error: "Internal error",
        reply: "Sorry, I'm having trouble responding right now. Please try again.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
