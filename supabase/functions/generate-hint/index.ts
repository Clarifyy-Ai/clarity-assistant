// supabase/functions/generate-hint/index.ts — PRODUCTION READY// supabase/functions/generate-hint/index.ts — PRODUCTIONBACK_HINTS =
  "• Open with a specific situation from your experience\n" +
  "• Focus on YOUR actions and decisions, not the team's\n" +
  "• Close with a measurable result or lesson learned";

// Allow only safe gemini model identifiers (optional)
function sanitizeModel(input?: string): string | undefined {
  const m = String(input ?? "").trim();
  if (!m) return undefined;
  if (!/^gemini-[a-z0-9.\-]+$/i.test(m)) return undefined;
  return m;
}

function json(headers: HeadersInit, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);
  const db = createServiceClient();

  try {
    /* ── AUTH ──────────────────────────────────────────────────────────── */
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

    /* ── PARSE BODY ────────────────────────────────────────────────────── */
    const body = await req.json().catch(() => null);

    if (!body?.question) {
      return json(headers, 400, { error: "Missing required field: question" });
    }

    const question = String(body.question).slice(0, 500);
    const transcript = String(body.transcript ?? "").slice(0, 800);
    const resumeCtx = String(body.resume_context ?? "").slice(0, 500);
    const interviewType = String(body.interview_type ?? "behavioral").slice(0, 50);
    const company = String(body.target_company ?? "").slice(0, 50);
    const requestedModel = sanitizeModel(body.model);

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
      hints = await geminiGenerate(
        prompt,
        SYSTEM,
        0.5,
        300,
        byok.gemini,
        requestedModel
      );
    } catch (aiErr) {
      console.error("[generate-hint] Gemini call failed:", aiErr);
      return json(headers, 200, { hints: FALLBACK_HINTS, source: "fallback" });
    }

    if (!hints || hints.trim().length === 0) {
      return json(headers, 200, { hints: FALLBACK_HINTS, source: "fallback" });
    }

    // Normalize to EXACTLY 3 bullets max
    const normalisedHints = hints
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .slice(0, 3)
      .map((line: string) => line.replace(/^[-*\d.•·]+\s*/, "• "))
      .join("\n");

    return json(headers, 200, { hints: normalisedHints, source: "ai" });
  } catch (err) {
    console.error("[generate-hint] Error:", err);
    return json(headers, 200, { hints: FALLBACK_HINTS, source: "fallback" });
  }
});
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

