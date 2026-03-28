import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiChat } from "../_shared/gemini.ts";

// SYSTEM ROLE
const SYSTEM = `
You are an expert, empathetic interview coach.
You may NOT answer the interview question directly.
You MUST provide brief guidance (<100 words).
Be encouraging, structured, and practical.
Use bullet points for tips.
`;

// ─────────────────────────────────────────────
// ai-coach-chat — Guided coach chat
// ─────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    /* --------------------------
       AUTHENTICATE USER
    -------------------------- */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders },
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const { data: { user }, error: userErr } = await db.auth.getUser(token);

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders },
      });
    }

    /* --------------------------
       READ BODY
    -------------------------- */
    const {
      session_id,
      question,
      transcript,
      user_message,
      history = [],
    } = await req.json();

    if (!session_id || !user_message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders } }
      );
    }

    /* --------------------------
       VALIDATE SESSION OWNERSHIP
    -------------------------- */
    const { data: sessionRow } = await db
      .from("sessions")
      .select("id, user_id, status")
      .eq("id", session_id)
      .single();

    if (!sessionRow || sessionRow.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Session not found or not yours" }),
        { status: 403, headers: { ...corsHeaders } }
      );
    }

    if (sessionRow.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Session not active" }),
        { status: 400, headers: { ...corsHeaders } }
      );
    }

    /* --------------------------
       OPTIONAL: Deduct credits
    -------------------------- */
    // const credit = await deductCredits(user.id, "ai_coach_chat", 1);
    // if (!credit.success) {
    //   return new Response(JSON.stringify({ error: "Insufficient credits" }), {
    //     status: 402,
    //     headers: { ...corsHeaders },
    //   });
    // }

    /* --------------------------
       SANITIZE INPUT
    -------------------------- */
    const safeUserMsg = String(user_message).slice(0, 2000);
    const safeTranscript = String(transcript ?? "").slice(0, 600);

    /* --------------------------
       BUILD CHAT HISTORY
    -------------------------- */
    const contextPrefix = `
Current interview question: "${question ?? "N/A"}"
Candidate's answer so far: "${safeTranscript}"

---
`;

    const messages = [
      { role: "user", parts: [{ text: contextPrefix }] },
      {
        role: "model",
        parts: [
          {
            text: "I understand the question and your progress. How can I support your preparation?",
          },
        ],
      },
      ...history.slice(-6).map((m: any) => ({
        role: m.role === "coach" ? "model" : "user",
        parts: [{ text: String(m.text).slice(0, 1000) }],
      })),
      { role: "user", parts: [{ text: safeUserMsg }] },
    ];

    /* --------------------------
       CALL GEMINI
    -------------------------- */
    const reply = await geminiChat(messages, SYSTEM, 0.6);

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-coach-chat error:", err);
    return new Response(
      JSON.stringify({
        error: "Internal error",
        reply:
          "Sorry, I'm having trouble responding right now. Please try again.",
      }),
      { status: 500, headers: { ...corsHeaders } }
    );
  }
});
