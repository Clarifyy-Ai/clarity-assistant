// supabase/functions/gap-analysis/index.ts — PRODUCTION READY (ALL FEATURES PRESERVED)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { 
  requireAuth, 
  parseBody, 
  errorResponse, 
  getAdminClient, 
  log 
} from "../_shared/utils.ts";
import {
  enforceAiRateLimitAsync,
} from "../_shared/rateLimit.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import { creditCost } from "../_shared/creditEconomics.ts";

const GAP_ANALYSIS_COST = creditCost("gap_analysis");

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "gap-analysis";

  try {
    /* -------------------------------------------------------
       AUTHENTICATE USER
    ------------------------------------------------------- */
    const auth = await requireAuth(req);
    const userId = auth.userId;

    const rateLimited = await enforceAiRateLimitAsync(
      getAdminClient(),
      "gap-analysis",
      userId,
    );
    if (rateLimited) return rateLimited;

    const capabilityGate = requireCapabilityForFunction(auth.planId, FN, req);
    if (capabilityGate) return capabilityGate;

    const db = getAdminClient();

    /* -------------------------------------------------------
       VALIDATE INPUT BODY
    ------------------------------------------------------- */
    const body = await parseBody<any>(req);

    if (!body || typeof body.resume_id !== "string" || typeof body.jd_id !== "string") {
      return errorResponse("Invalid input", "INVALID_REQUEST", 400, req);
    }

    const resume_id = body.resume_id.trim();
    const jd_id = body.jd_id.trim();

    if (!resume_id || !jd_id) {
      return errorResponse("Invalid IDs", "INVALID_REQUEST", 400, req);
    }

    /* -------------------------------------------------------
       FETCH RESUME (ownership enforced)
    ------------------------------------------------------- */
    const { data: resume, error: rErr } = await db
      .from("resumes")
      .select("name, content, url, content_hash, created_at")
      .eq("id", resume_id)
      .eq("user_id", userId)
      .single();

    if (rErr || !resume) {
      return errorResponse("Resume not found", "NOT_FOUND", 404, req);
    }

    /* -------------------------------------------------------
       FETCH JOB DESCRIPTION (ownership enforced)
    ------------------------------------------------------- */
    const { data: jd, error: jErr } = await db
      .from("job_descriptions")
      .select("title, content, target_role, company, parsed_data, updated_at, created_at")
      .eq("id", jd_id)
      .eq("user_id", userId)
      .single();

    if (jErr || !jd) {
      return errorResponse("Job description not found", "NOT_FOUND", 404, req);
    }

    /* -------------------------------------------------------
       P0-4: DEDUCT CREDITS (server-authoritative)
    ------------------------------------------------------- */
    const creditResult = await deductCreditsAtomic({
      userId,
      action: "gap_analysis",
      cost: GAP_ANALYSIS_COST,
      idempotencyKey: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
    });
    if (!creditResult.success) {
      return errorResponse(
        `Insufficient credits. Gap analysis costs ${GAP_ANALYSIS_COST} credits.`,
        "INSUFFICIENT_CREDITS",
        402,
        req,
      );
    }

    /* -------------------------------------------------------
       SANITIZE & TRIM LARGE CONTENT (Preserved exact limits)
    ------------------------------------------------------- */
    const safeResume = String(resume.content ?? "")
      .replace(/\u0000/g, "")
      .slice(0, 3000);

    const safeJD = (jd.content ?? JSON.stringify(jd.parsed_data ?? {}, null, 2))
      .replace(/\u0000/g, "")
      .slice(0, 3000);

    /* -------------------------------------------------------
       BUILD SECURE PROMPT
    ------------------------------------------------------- */
    const prompt = `
Analyze the alignment between this resume and job description.
Use ONLY facts present in the resume text. Do not invent employers, titles, dates, metrics, or technologies.
If a JD requirement is not evidenced in the resume, list it under missing_skills / experience_gap as a gap — never as a fabricated match.
Return ONLY valid JSON.

Schema:
{
  "match_score": number,
  "matching_skills": string[],
  "missing_skills": string[],
  "recommendations": string[],
  "experience_gap": string,
  "education_fit": string,
  "matched_evidence": string[],
  "missing_evidence": string[]
}

Resume:
${safeResume}

Job Description:
${safeJD}
`.trim();

    /* -------------------------------------------------------
       CALL AI SAFELY
    ------------------------------------------------------- */
    let aiResult;
    try {
      aiResult = await generateWithFallback({
        prompt,
        maxTokens: 2048,
        temperature: 0.5,
        jsonMode: true,
        userId,
        action: "gap_analysis",
      });
    } catch (err) {
      await refundCredits({
        userId,
        cost: GAP_ANALYSIS_COST,
        reason: "refund_gap_analysis_ai_failure",
      });
      throw err;
    }

    if (!aiResult?.text) {
      await refundCredits({
        userId,
        cost: GAP_ANALYSIS_COST,
        reason: "refund_gap_analysis_empty",
      });
      return errorResponse("Gap analysis unavailable. Credits refunded.", "AI_ERROR", 502, req);
    }

    const clean = aiResult.text.replace(/```json|```/g, "").trim();

    /* -------------------------------------------------------
       SAFE JSON PARSING (Preserved original fallback)
    ------------------------------------------------------- */
    let analysis: {
      match_score: number;
      matching_skills: string[];
      missing_skills: string[];
      recommendations: string[];
      experience_gap: string;
      education_fit: string;
      parse_failed?: boolean;
    } = {
      match_score: 0,
      matching_skills: [],
      missing_skills: [],
      recommendations: [],
      experience_gap: "",
      education_fit: "",
    };

    try {
      const parsed = JSON.parse(clean);
      if (typeof parsed === "object" && !Array.isArray(parsed)) {
        analysis = { ...analysis, ...parsed };
      }
    } catch (_) {
      analysis.parse_failed = true;
      analysis.recommendations = [
        "The model response could not be parsed. Retry analysis — source selections are kept.",
      ];
    }

    log(FN, "info", "Gap analysis generated", { userId, resume_id, jd_id });

    try {
      await db.from("gap_analyses").upsert(
        {
          user_id: userId,
          resume_id,
          jd_id,
          result: analysis,
          stale: Boolean(analysis.parse_failed),
          resume_updated_at: String(resume.content_hash || resume.created_at || ""),
          jd_updated_at: String(jd.updated_at || jd.created_at || ""),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,resume_id,jd_id" },
      );
    } catch (persistErr) {
      console.warn("[gap-analysis] persist skipped", persistErr);
    }

    return new Response(JSON.stringify({ ...analysis, stale: false }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    if (err instanceof Response) return err;
    log(FN, "error", "resume-jd-analysis error", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500, req);
  }
});
