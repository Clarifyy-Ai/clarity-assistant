// generate-answer/index.ts — Full STAR-format answer generator with SSE streaming

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-2.0-flash";

const SYSTEM_PROMPT = `You are an expert interview coach. Generate a complete, well-structured answer using the STAR method (Situation, Task, Action, Result). The answer should be 150-200 words, confident, and specific. Do not use bullet points — write in flowing paragraphs. Make it sound natural and conversational, as if the candidate is speaking aloud.`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ── AUTH ── */
    const db = createServiceClient();
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

    /* ── CREDITS CHECK (2 credits for full answer) ── */
    const { data: profile } = await db.from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    if (!profile || profile.credits < 2) {
      return new Response(JSON.stringify({ error: "Insufficient credits (need 2)" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── PARSE BODY ── */
    const body = await req.json().catch(() => null);
    if (!body?.question) {
      return new Response(JSON.stringify({ error: "Missing question" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const question = String(body.question).slice(0, 500);
    const transcript = String(body.transcript ?? "").slice(0, 800);
    const resumeCtx = String(body.resume_context ?? "").slice(0, 500);
    const interviewType = String(body.interview_type ?? "behavioral").slice(0, 50);
    const company = String(body.target_company ?? "").slice(0, 50);

    /* ── BUILD PROMPT ── */
    const userPrompt = `
Interview type: ${interviewType}
Company: ${company || "unspecified"}
Question: "${question}"
Candidate's answer so far: "${transcript || "Nothing yet"}"
Resume context: ${resumeCtx || "None"}

Generate a complete STAR-format answer for this interview question. Write 150-200 words in flowing paragraphs.
`.trim();

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── CALL GEMINI WITH STREAMING ── */
    const geminiUrl = `${GEMINI_BASE}/models/${MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "Unknown error");
      console.error("[generate-answer] Gemini error:", errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── DEDUCT CREDITS ── */
    await db.from("profiles")
      .update({
        credits: profile.credits - 2,
        credits_used_this_month: (profile as any).credits_used_this_month
          ? (profile as any).credits_used_this_month + 2
          : 2,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    await db.from("credit_transactions").insert({
      user_id: user.id,
      amount: -2,
      action: "usage",
      balance_after: profile.credits - 2,
      description: "Full answer generation",
    });

    /* ── STREAM SSE TO CLIENT ── */
    const encoder = new TextEncoder();
    const reader = geminiRes.body!.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
                if (text) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                }
              } catch { /* skip malformed */ }
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("[generate-answer] Stream error:", err);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("[generate-answer] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
