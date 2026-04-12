// generate-answer/index.ts — Full STAR-format answer generator with SSE streaming
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta";
const MODEL          = "gemini-2.0-flash";

const SYSTEM_PROMPT = `You are an expert interview coach helping a candidate answer live interview questions.
Generate a complete, confident answer using the STAR method (Situation, Task, Action, Result).
Requirements:
- 150-200 words total
- Write in flowing paragraphs, NOT bullet points
- Sound natural and conversational, as if spoken aloud
- Be specific — reference the resume context when available
- Do NOT say "Situation:", "Task:", etc. — weave the structure naturally into the prose`;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);

  try {
    /* ── AUTH ──────────────────────────────────────────────────────────── */
    const db          = createServiceClient();
    const authHeader  = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";

    if (!new RegExp("^bearer\\s+", "i").test(authHeader)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(new RegExp("^bearer\\s+", "i"), "");
    const { data: { user }, error: authErr } = await db.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    /* ── PARSE BODY ────────────────────────────────────────────────────── */
    const body = await req.json().catch(() => null);
    if (!body?.question) {
      return new Response(JSON.stringify({ error: "Missing required field: question" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const question      = String(body.question).slice(0, 500);
    const transcript    = String(body.transcript      ?? "").slice(0, 800);
    const resumeCtx     = String(body.resume_context  ?? "").slice(0, 500);
    const interviewType = String(body.interview_type  ?? "behavioral").slice(0, 50);
    const company       = String(body.target_company  ?? "").slice(0, 50);
    const sessionId     = body.session_id ?? null;

    /* ── CREDITS CHECK ─────────────────────────────────────────────────── */
    const COST = 2;

    const { data: profile, error: profileErr } = await db
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: "Could not fetch user profile" }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    if ((profile.credits ?? 0) < COST) {
      return new Response(
        JSON.stringify({ error: `Insufficient credits. Need ${COST}, have ${profile.credits ?? 0}.` }),
        { status: 402, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    /* ── GEMINI AVAILABILITY CHECK ─────────────────────────────────────── */
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 503,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    /* ── DEDUCT CREDITS BEFORE GENERATION ──────────────────────────────── */
    // Use the correct DB function signature: deduct_credits(p_action, p_cost, p_session_id)
    // This RPC uses auth.uid() internally via the service client, but since we're
    // using createServiceClient (service role), auth.uid() is null.
    // Instead, use the shared deductCredits helper which does atomic UPDATE.
    const { deductCredits } = await import("../_shared/supabase.ts");
    const deductResult = await deductCredits(user.id, "Full STAR answer generation", COST);

    if (!deductResult.success) {
      console.error("[generate-answer] Credit deduction failed:", deductResult.error);
      return new Response(
        JSON.stringify({ error: deductResult.error ?? "Credit deduction failed" }),
        { status: 402, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    /* ── BUILD PROMPT ──────────────────────────────────────────────────── */
    const userPrompt = [
      `Interview type: ${interviewType}`,
      `Company: ${company || "not specified"}`,
      `Question: "${question}"`,
      `Candidate's answer so far: "${transcript || "Nothing yet — generate a complete answer from scratch"}"`,
      `Resume context: ${resumeCtx || "None provided"}`,
      "",
      "Generate a complete, natural STAR-format answer (150-200 words) for this interview question.",
    ].join("\n");

    /* ── CALL GEMINI WITH STREAMING ────────────────────────────────────── */
    const geminiUrl = `${GEMINI_BASE}/models/${MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature:     0.7,
          maxOutputTokens: 1024,
          topP:            0.95,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "Unknown Gemini error");
      console.error("[generate-answer] Gemini API error:", geminiRes.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed. Please try again." }), {
        status: 502,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    /* ── PROXY SSE STREAM TO CLIENT ────────────────────────────────────── */
    const encoder = new TextEncoder();
    const reader  = geminiRes.body!.getReader();
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
                const text: string =
                  parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

                if (text) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
                  );
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (streamErr) {
          console.error("[generate-answer] Stream read error:", streamErr);
          controller.error(streamErr);
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection":    "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[generate-answer] Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
