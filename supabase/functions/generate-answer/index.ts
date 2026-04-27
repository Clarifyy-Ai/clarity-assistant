// supabase/functions/generate-answer/index.ts
// Full STAR-format answer generator with SSE streaming via Gemini 2.0 Flash.

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCreditsAtomic } from "../_shared/supabase.ts";

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

// Cost in credits for a full STAR answer (manual: “Live Answer Generation Long 200 tokens → 12 credits”,
// you can adjust this COST to match your pricing model; we keep it 2 per your draft). [file:1][file:3]
const COST = 2;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);
  const db = createServiceClient();

  try {
    // ── AUTH ─────────────────────────────────────────────────────
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";

    if (!/^bearer\s+/i.test(authHeader)) {
      return json(headers, 401, { error: "Unauthorized" });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const {
      data: { user },
      error: authErr,
    } = await db.auth.getUser(token);

    if (authErr || !user) {
      return json(headers, 401, { error: "Unauthorized" });
    }

    // ── BODY PARSE & VALIDATION ──────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body?.question) {
      return json(headers, 400, { error: "Missing required field: question" });
    }

    const question      = String(body.question).slice(0, 500);
    const transcript    = String(body.transcript      ?? "").slice(0, 800);
    const resumeCtx     = String(body.resume_context  ?? "").slice(0, 500);
    const interviewType = String(body.interview_type  ?? "behavioral").slice(0, 50);
    const company       = String(body.target_company  ?? "").slice(0, 50);
    const sessionId     = body.session_id ?? null;

    // ── GEMINI CONFIG CHECK ──────────────────────────────────────
    if (!GEMINI_API_KEY) {
      return json(headers, 503, { error: "AI service not configured" });
    }

    // ── CREDITS DEDUCTION (ATOMIC) ───────────────────────────────
    // Use a shared helper that:
    //  - Performs an atomic UPDATE on profiles.credits
    //  - Inserts into credittransactions with balancebefore/balanceafter
    //  - Returns { success, error, balanceAfter }
    const deduction = await deductCreditsAtomic({
      userId: user.id,
      action: "liveanswerlong", // aligns with manual: Live Answer Generation Long [file:1][file:3]
      cost: COST,
      sessionId,
    });

    if (!deduction.success) {
      return json(headers, 402, {
        error: deduction.error ?? "Insufficient credits",
      });
    }

    const balanceAfter = deduction.balanceAfter ?? 0;

    // ── GEMINI PROMPT BUILD ──────────────────────────────────────
    const userPrompt = [
      `Interview type: ${interviewType}`,
      `Company: ${company || "not specified"}`,
      `Question: "${question}"`,
      `Candidate's answer so far: "${
        transcript || "Nothing yet — generate a complete answer from scratch"
      }"`,
      `Resume context: ${resumeCtx || "None provided"}`,
      "",
      "Generate a complete, natural STAR-format answer (150-200 words) for this interview question.",
    ].join("\n");

    // ── REFUND HELPER (pre-stream failure) ───────────────────────
    const refundCredits = async (reason: string) => {
      try {
        // Re-add COST to credits and log a refund transaction via helper.
        await db.rpc("refund_credits", {
          p_user_id: user.id,
          p_amount:  COST,
          p_reason:  reason,
        });
      } catch (e) {
        console.error("[generate-answer] Refund failed:", e);
      }
    };

    // ── CALL GEMINI STREAMING API ────────────────────────────────
    const geminiUrl = `${GEMINI_BASE}/models/${MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    let geminiRes: Response;
    try {
      geminiRes = await fetch(geminiUrl, {
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
    } catch (fetchErr) {
      console.error("[generate-answer] Gemini fetch error:", fetchErr);
      await refundCredits("Gemini network error");
      return json(headers, 502, {
        error: "AI service unreachable. Credits refunded.",
      });
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "Unknown Gemini error");
      console.error(
        "[generate-answer] Gemini API error:",
        geminiRes.status,
        errText,
      );
      await refundCredits(`Gemini HTTP ${geminiRes.status}`);
      return json(headers, 502, {
        error: "AI generation failed. Credits refunded.",
      });
    }

    if (!geminiRes.body) {
      console.error("[generate-answer] Empty Gemini body");
      await refundCredits("Empty Gemini stream");
      return json(headers, 502, {
        error: "Empty AI response. Credits refunded.",
      });
    }

    // ── PROXY SSE STREAM TO CLIENT ───────────────────────────────
    const encoder = new TextEncoder();
    const reader  = geminiRes.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n"); // real newline [file:1][web:30]
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;

              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(jsonStr) as {
                  candidates?: Array<{
                    content?: { parts?: Array<{ text?: string }> };
                  }>;
                };

                const text =
                  parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

                if (text) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ text })}\n\n`,
                    ),
                  );
                }
              } catch {
                // skip malformed JSON chunks
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
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache, no-transform",
        Connection:          "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[generate-answer] Unhandled error:", err);
    return json(getCorsHeaders(req), 500, { error: "Internal server error" });
  }
});

/* ──────────────────────────────────────────────────────────────── */

function json(
  headers: HeadersInit,
  status: number,
  body: unknown,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
