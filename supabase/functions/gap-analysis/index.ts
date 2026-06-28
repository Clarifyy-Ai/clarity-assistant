// supabase/functions/gap-analysis/index.ts — PRODUCTION READY (ALL FEATURES PRESERVED)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { 
  requireAuth, 
  parseBody, 
  errorResponse, 
  callAI, 
  getAdminClient, 
  log 
} from "../_shared/utils.ts";
import {
  enforceAiRateLimit,
} from "../_shared/rateLimit.ts";

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

    const rateLimited = enforceAiRateLimit("gap-analysis", userId);
    if (rateLimited) return rateLimited;

    const db = getAdminClient();

    /* -------------------------------------------------------
       VALIDATE INPUT BODY
    ------------------------------------------------------- */
    const body = await parseBody<any>(req);

    if (!body || typeof body.resume_id !== "string" || typeof body.jd_id !== "string") {
      return errorResponse("Invalid input", "INVALID_REQUEST", 400);
    }

    const resume_id = body.resume_id.trim();
    const jd_id = body.jd_id.trim();

    if (!resume_id || !jd_id) {
      return errorResponse("Invalid IDs", "INVALID_REQUEST", 400);
    }

    /* -------------------------------------------------------
       FETCH RESUME (ownership enforced)
    ------------------------------------------------------- */
    const { data: resume, error: rErr } = await db
      .from("resumes")
      .select("name, content, url")
      .eq("id", resume_id)
      .eq("user_id", userId)
      .single();

    if (rErr || !resume) {
      return errorResponse("Resume not found", "NOT_FOUND", 404);
    }

    /* -------------------------------------------------------
       FETCH JOB DESCRIPTION (ownership enforced)
    ------------------------------------------------------- */
    const { data: jd, error: jErr } = await db
      .from("job_descriptions")
      .select("title, content, target_role, company, parsed_data")
      .eq("id", jd_id)
      .eq("user_id", userId)
      .single();

    if (jErr || !jd) {
      return errorResponse("Job description not found", "NOT_FOUND", 404);
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
Return ONLY valid JSON.

Schema:
{
  "match_score": number,
  "matching_skills": string[],
  "missing_skills": string[],
  "recommendations": string[],
  "experience_gap": string,
  "education_fit": string
}

Resume:
${safeResume}

Job Description:
${safeJD}
`.trim();

    /* -------------------------------------------------------
       CALL AI SAFELY
    ------------------------------------------------------- */
    const aiResult = await callAI({
      model: "gemini-2.0-flash", // Using latest Gemini matching original intent
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2048,
    });

    const clean = aiResult.text.replace(/```json|```/g, "").trim();

    /* -------------------------------------------------------
       SAFE JSON PARSING (Preserved original fallback)
    ------------------------------------------------------- */
    let analysis = {
      match_score: 0,
      matching_skills: [],
      missing_skills: [],
      recommendations: ["Unable to parse AI response."],
      experience_gap: "Unknown",
      education_fit: "Unknown",
    };

    try {
      const parsed = JSON.parse(clean);
      if (typeof parsed === "object" && !Array.isArray(parsed)) {
        analysis = { ...analysis, ...parsed };
      }
    } catch (_) {
      // fallback remains
    }

    log(FN, "info", "Gap analysis generated", { userId, resume_id, jd_id });

    return new Response(JSON.stringify(analysis), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    if (err instanceof Response) return err;
    log(FN, "error", "resume-jd-analysis error", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
});
