// generate-hint/index.ts — Lightweight live interview hint generator

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { geminiGenerate } from "../_shared/gemini.ts";

const SYSTEM = `
You are a stealth interview assistant. The candidate needs quick, discreet hints.
Rules:
- Return EXACTLY 3 bullet points (no more, no less)
- Each bullet is max 15 words
- Never give the full answer — only guide the thinking
- Be practical and specific
- Format as plain text with "• " prefix per line
`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    /* ── AUTH ── */
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── PARSE BODY ── */
    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      question,
      transcript,
      interview_type,
      target_company,
      resume_context,
    } = body;

    if (!question) {
      return new Response(JSON.stringify({ error: "Missing question" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeQuestion = String(question).slice(0, 500);
    const safeTranscript = String(transcript ?? "").slice(0, 800);
    const safeResume = String(resume_context ?? "").slice(0, 500);

    /* ── BUILD PROMPT ── */
    const prompt = `
Interview type: ${String(interview_type ?? "behavioral").slice(0, 50)}
Company: ${String(target_company ?? "unspecified").slice(0, 50)}

Question being asked: "${safeQuestion}"

Candidate's answer so far: "${safeTranscript || "Nothing yet"}"

Resume context: ${safeResume || "None"}

Give exactly 3 short bullet-point hints to help the candidate answer this question better.
Do NOT give the full answer. Guide their thinking.
`.trim();

    /* ── CALL GEMINI ── */
    const hints = await geminiGenerate(prompt, SYSTEM, 0.5, 300);

    if (!hints) {
      return new Response(JSON.stringify({
        hints: "• Take a moment to structure your thoughts\n• Use the STAR method\n• Connect to your experience",
        source: "fallback",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ hints, source: "ai" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[generate-hint] Error:", err);
    return new Response(JSON.stringify({
      hints: "• Take a moment to structure your thoughts\n• Use the STAR method\n• Connect to your experience",
      source: "fallback",
      error: err instanceof Error ? err.message : "Unknown error",
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
