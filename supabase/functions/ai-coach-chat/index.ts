import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiChat } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// ai-coach-chat — real-time coach chat during session
// ─────────────────────────────────────────────────────────────────

const SYSTEM = `You are an expert, empathetic interview coach helping
a candidate during their mock interview session. You can see the
current question and their answer so far. Be concise (under 100 words),
practical, and encouraging. Never answer the question for them — guide
them to find the answer themselves. Use bullet points when listing tips.`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const {
      session_id,
      question,
      transcript,
      user_message,
      history = [],
    } = await req.json();

    if (!user_message) {
      return new Response(
        JSON.stringify({ error: "Missing user_message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build message history for Gemini
    const contextPrefix = `
Current interview question: "${question}"
Candidate's answer so far: "${transcript?.slice(0, 600) ?? "Not started yet"}"

---`;

    const messages = [
      // Inject context as first user turn
      {
        role:  "user" as const,
        parts: [{ text: contextPrefix }],
      },
      {
        role:  "model" as const,
        parts: [{ text: "Understood. I can see the question and your progress. How can I help?" }],
      },
      // Prior history
      ...history.slice(-6).map((m: any) => ({
        role:  m.role === "coach" ? "model" as const : "user" as const,
        parts: [{ text: m.text }],
      })),
      // New message
      {
        role:  "user" as const,
        parts: [{ text: user_message }],
      },
    ];

    const reply = await geminiChat(messages, SYSTEM, 0.6);

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("ai-coach-chat error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", reply: "Sorry, I'm having trouble responding. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
