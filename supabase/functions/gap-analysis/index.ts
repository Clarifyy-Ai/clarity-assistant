// supabase/functions/gap-analysis/index.ts — PRODUCTION READY (ALL GATES & VERSIONING ENFORCED)

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
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import { creditCost } from "../_shared/creditEconomics.ts";

const GAP_ANALYSIS_COST = creditCost("gap_analysis");

function repairJsonString(raw: string): string {
  let text = raw.replace(/```json|```/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  text = text.replace(/,\s*([}\]])/g, "$1");
  return text;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "gap-analysis";

  try {
    /* -------------------------------------------------------
       1. AUTHENTICATE USER
    ------------------------------------------------------- */
    const auth = await requireAuth(req);
    const userId = auth.userId;

    const db = getAdminClient();

    /* -------------------------------------------------------
       2. ACCOUNT RESTRICTION / BAN CHECK
    ------------------------------------------------------- */
    if (await isUserBanned(db, userId)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimited = await enforceAiRateLimitAsync(
      db,
      "gap-analysis",
      userId,
    );
    if (rateLimited) return rateLimited;

    /* -------------------------------------------------------
       3. PLAN / CAPABILITY GATE
    ------------------------------------------------------- */
    const capabilityGate = requireCapabilityForFunction(auth.planId, FN, req);
    if (capabilityGate) return capabilityGate;

    /* -------------------------------------------------------
       4. VALIDATE INPUT BODY
    ------------------------------------------------------- */
    const body = await parseBody<any>(req);

    if (!body || typeof body.resume_id !== "string" || typeof body.jd_id !== "string") {
      return errorResponse("Invalid input. resume_id and jd_id are required.", "INVALID_REQUEST", 400, req);
    }

    const resume_id = body.resume_id.trim();
    const jd_id = body.jd_id.trim();
    const force_rerun = Boolean(body.force_rerun);

    if (!resume_id || !jd_id) {
      return errorResponse("Invalid IDs.", "INVALID_REQUEST", 400, req);
    }

    /* -------------------------------------------------------
       5. FETCH RESUME & CHECK PARSING / OWNERSHIP
    ------------------------------------------------------- */
    const { data: resume, error: rErr } = await db
      .from("resumes")
      .select("id, user_id, name, content, url, content_hash, created_at, updated_at")
      .eq("id", resume_id)
      .maybeSingle();

    if (rErr || !resume) {
      return errorResponse("Resume not found.", "RESUME_NOT_FOUND", 404, req);
    }

    if (resume.user_id !== userId) {
      return errorResponse("You do not have permission to access this resume.", "OWNERSHIP_VIOLATION", 403, req);
    }

    const resumeContent = String(resume.content ?? "").trim();
    if (resumeContent.length < 20) {
      return errorResponse(
        "Resume parsing has not completed or contains no readable text.",
        "UNPARSED_RESUME",
        422,
        req,
      );
    }

    /* -------------------------------------------------------
       6. FETCH JOB DESCRIPTION & CHECK PARSING / OWNERSHIP
    ------------------------------------------------------- */
    const { data: jd, error: jErr } = await db
      .from("job_descriptions")
      .select("id, user_id, title, content, target_role, company, parsed_data, content_hash, updated_at, created_at")
      .eq("id", jd_id)
      .maybeSingle();

    if (jErr || !jd) {
      return errorResponse("Job description not found.", "JD_NOT_FOUND", 404, req);
    }

    if (jd.user_id !== userId) {
      return errorResponse("You do not have permission to access this job description.", "OWNERSHIP_VIOLATION", 403, req);
    }

    const jdContent = String(jd.content ?? "").trim();
    const jdParsed = jd.parsed_data && typeof jd.parsed_data === "object" && Object.keys(jd.parsed_data).length > 0;
    if (jdContent.length < 20 && !jdParsed) {
      return errorResponse(
        "Job description parsing has not completed or contains no readable text.",
        "UNPARSED_JD",
        422,
        req,
      );
    }

    /* -------------------------------------------------------
       7. DOCUMENT VERSIONING SNAPSHOT
    ------------------------------------------------------- */
    const resume_version = String(resume.content_hash || resume.updated_at || resume.created_at || "v1").slice(0, 100);
    const jd_version = String(jd.content_hash || jd.updated_at || jd.created_at || "v1").slice(0, 100);

    /* -------------------------------------------------------
       8. CHECK EXISTING ACTIVE ANALYSIS FOR EXACT VERSIONS
    ------------------------------------------------------- */
    if (!force_rerun) {
      const { data: existing } = await db
        .from("gap_analyses")
        .select("*")
        .eq("user_id", userId)
        .eq("resume_id", resume_id)
        .eq("jd_id", jd_id)
        .eq("resume_version", resume_version)
        .eq("jd_version", jd_version)
        .eq("stale", false)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing && existing.result) {
        return new Response(
          JSON.stringify({
            ...existing.result,
            id: existing.id,
            stale: false,
            status: "completed",
            resume_version,
            jd_version,
            cached: true,
          }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }
    }

    /* -------------------------------------------------------
       9. DEDUCT CREDITS (server-authoritative)
    ------------------------------------------------------- */
    const creditResult = await deductCreditsAtomic({
      userId,
      action: "gap_analysis",
      cost: GAP_ANALYSIS_COST,
      idempotencyKey: req.headers.get("x-idempotency-key") || `gap_${userId}_${resume_id}_${jd_id}_${resume_version}_${jd_version}`,
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
       10. SANITIZE & BUILD PROMPT
    ------------------------------------------------------- */
    const safeResume = resumeContent.replace(/\u0000/g, "").slice(0, 3000);
    const safeJD = (jdContent || JSON.stringify(jd.parsed_data ?? {}, null, 2))
      .replace(/\u0000/g, "")
      .slice(0, 3000);

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
       11. CALL AI SAFELY
    ------------------------------------------------------- */
    let aiResult;
    try {
      aiResult = await generateWithFallback({
        prompt,
        maxTokens: 2048,
        temperature: 0.3,
        jsonMode: true,
        userId,
        action: "gap_analysis",
      });
    } catch (err) {
      await refundCredits({
        userId,
        cost: GAP_ANALYSIS_COST,
        reason: "refund_gap_analysis_provider_unavailable",
      }).catch(() => {});
      return errorResponse("AI provider is currently unavailable. Credits refunded.", "PROVIDER_UNAVAILABLE", 503, req);
    }

    if (!aiResult?.text) {
      await refundCredits({
        userId,
        cost: GAP_ANALYSIS_COST,
        reason: "refund_gap_analysis_empty",
      }).catch(() => {});
      return errorResponse("Gap analysis unavailable. Credits refunded.", "AI_ERROR", 502, req);
    }

    /* -------------------------------------------------------
       12. BOUNDED REPAIR & SCHEMA VALIDATION
    ------------------------------------------------------- */
    let analysis = {
      match_score: 0,
      matching_skills: [] as string[],
      missing_skills: [] as string[],
      recommendations: [] as string[],
      experience_gap: "",
      education_fit: "",
      matched_evidence: [] as string[],
      missing_evidence: [] as string[],
      parse_failed: false,
    };

    let parseOk = false;

    // Attempt 1: Direct JSON parse
    try {
      const clean = aiResult.text.replace(/```json|```/gi, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        analysis = {
          match_score: Math.min(100, Math.max(0, Number(parsed.match_score) || 0)),
          matching_skills: Array.isArray(parsed.matching_skills) ? parsed.matching_skills.map(String) : [],
          missing_skills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills.map(String) : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
          experience_gap: String(parsed.experience_gap ?? ""),
          education_fit: String(parsed.education_fit ?? ""),
          matched_evidence: Array.isArray(parsed.matched_evidence) ? parsed.matched_evidence.map(String) : [],
          missing_evidence: Array.isArray(parsed.missing_evidence) ? parsed.missing_evidence.map(String) : [],
          parse_failed: false,
        };
        parseOk = true;
      }
    } catch {
      // Attempt 2: Bounded repair
      try {
        const repaired = repairJsonString(aiResult.text);
        const parsed = JSON.parse(repaired);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          analysis = {
            match_score: Math.min(100, Math.max(0, Number(parsed.match_score) || 0)),
            matching_skills: Array.isArray(parsed.matching_skills) ? parsed.matching_skills.map(String) : [],
            missing_skills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills.map(String) : [],
            recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
            experience_gap: String(parsed.experience_gap ?? ""),
            education_fit: String(parsed.education_fit ?? ""),
            matched_evidence: Array.isArray(parsed.matched_evidence) ? parsed.matched_evidence.map(String) : [],
            missing_evidence: Array.isArray(parsed.missing_evidence) ? parsed.missing_evidence.map(String) : [],
            parse_failed: false,
          };
          parseOk = true;
        }
      } catch {
        parseOk = false;
      }
    }

    if (!parseOk) {
      analysis.parse_failed = true;
      analysis.recommendations = [
        "The model response could not be parsed safely. Please retry the analysis.",
      ];
      analysis.experience_gap = "Unable to parse experience alignment.";
      analysis.education_fit = "Unable to parse education fit.";
    }

    log(FN, "info", "Gap analysis generated", { userId, resume_id, jd_id, parseOk });

    /* -------------------------------------------------------
       13. PERSIST WITH EXACT DOCUMENT VERSIONS & PRESERVE HISTORY
    ------------------------------------------------------- */
    try {
      // Mark prior non-stale analyses as stale so historical analysis is preserved without deletion
      await db
        .from("gap_analyses")
        .update({ stale: true, status: "stale", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("resume_id", resume_id)
        .eq("jd_id", jd_id)
        .eq("stale", false);

      await db.from("gap_analyses").upsert(
        {
          user_id: userId,
          resume_id,
          jd_id,
          resume_version,
          jd_version,
          resume_content_hash: String(resume.content_hash || ""),
          jd_content_hash: String(jd.content_hash || ""),
          result: analysis,
          status: parseOk ? "completed" : "failed_recoverable",
          stale: Boolean(analysis.parse_failed),
          resume_updated_at: resume.created_at || null,
          jd_updated_at: jd.updated_at || jd.created_at || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,resume_id,jd_id,resume_version,jd_version" },
      );
    } catch (persistErr) {
      console.warn("[gap-analysis] persist skipped", persistErr);
    }

    return new Response(
      JSON.stringify({
        ...analysis,
        stale: Boolean(analysis.parse_failed),
        status: parseOk ? "completed" : "failed_recoverable",
        resume_version,
        jd_version,
      }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      },
    );

  } catch (err: any) {
    if (err instanceof Response) return err;
    log(FN, "error", "resume-jd-analysis error", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500, req);
  }
});
