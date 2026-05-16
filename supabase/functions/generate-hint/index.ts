// supabase/functions/generate-hint/index.ts — FIXED
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { geminiGenerate } from "../_shared/gemini.ts";
import { extractBYOK } from "../_shared/utils.ts";

const SYSTEM = `You are a discreet interview assistant giving rapid coaching hints.
Rules (non-negotiable):
- Return EXACTLY 3 bullet points, no more, no less
- Each bullet starts with "• " (bullet + space)
- Each bullet is maximum 15 words
- Do NOT give the full answer — only guide the candidate's thinking
- Be practical, specific, and immediately actionable
- Separate each bullet with a newline character
- Output only the 3 bullets, nothing else`;

const FALLBACK_HINTS =
  "• Open with a specific situation from your experience\n" +
  "• Focus on YOUR actions and decisions, not the team's\n" +
  "• Close with a measurable result or lesson learned";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    /* ── AUTH ──────────────────────────────────────────────────────────── */
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";

    if (!new RegExp("^bearer\\s+", "i").test(authHeader)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(new RegExp("^bearer\\s+", "i"), "");
    const { data: { user }, error: authErr } = await db.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    /* ── PARSE BODY ────────────────────────────────────────────────────── */
    const body = await req.json().catch(() => null);

    if (!body?.question) {
      return new Response(JSON.stringify({ error: "Missing required field: question" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const question      = String(body.question).slice(0, 500);
    const transcript    = String(body.transcript      ?? "").slice(0, 800);
    const resumeCtx     = String(body.resume_context  ?? "").slice(0, 500);
    const interviewType = String(body.interview_type  ?? "behavioral").slice(0, 50);
    const company       = String(body.target_company  ?? "").slice(0, 50);
    const requestedModel = String(body.model ?? "").trim() || undefined;

    /* ── BUILD PROMPT ──────────────────────────────────────────────────── */
    const prompt = [
      `Interview type: ${interviewType}`,
      `Company: ${company || "not specified"}`,
      `Question being asked: "${question}"`,
      `Candidate's answer so far: "${transcript || "Nothing yet"}"`,
      `Resume context: ${resumeCtx || "None"}`,
      "",
      "Give exactly 3 short hint bullets to guide the candidate. Do NOT write the answer for them.",
    ].join("\n");

    /* ── CALL GEMINI (BYOK aware) ──────────────────────────────────────── */
    const byok = extractBYOK(req);

    let hints = "";
    try {
      hints = await geminiGenerate(prompt, SYSTEM, 0.5, 300, byok.gemini, requestedModel);
    } catch (aiErr) {
      console.error("[generate-hint] Gemini call failed:", aiErr);
      return new Response(
        JSON.stringify({ hints: FALLBACK_HINTS, source: "fallback" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (!hints || hints.trim().length === 0) {
      return new Response(
        JSON.stringify({ hints: FALLBACK_HINTS, source: "fallback" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const normalisedHints = hints
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 3)
      .map((line) => line.replace(/^[-*\d.•·]+\s*/, "• "))
      .join("\n");

    return new Response(
      JSON.stringify({ hints: normalisedHints, source: "ai" }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-hint] Error:", err);
    return new Response(
      JSON.stringify({ hints: FALLBACK_HINTS, source: "fallback" }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
``
