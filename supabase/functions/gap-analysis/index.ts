// supabase/functions/gap-analysis/index.ts — hybrid: deterministic → python → AI

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  parseBody,
  errorResponse,
  getAdminClient,
  log,
} from "../_shared/utils.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import { getAiFeaturePolicy } from "../_shared/aiFeaturePolicy.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { executeHybridOperation } from "../_shared/hybridExecute.ts";
import { pythonExecuteOperation } from "../_shared/pythonClient.ts";
import { httpStatusForDomainCode } from "../_shared/domainErrors.ts";
import { httpStatusForDocumentError, mapHybridDocumentCode } from "../_shared/documentErrors.ts";

const GAP_ANALYSIS_COST = creditCost("gap_analysis");

const KNOWN_SKILLS = [
  "python",
  "java",
  "javascript",
  "typescript",
  "react",
  "sql",
  "aws",
  "docker",
  "kubernetes",
  "fastapi",
  "node.js",
  "go",
  "rust",
  "kotlin",
  "swift",
  "leadership",
  "communication",
  "machine learning",
  "c++",
  "data analysis",
] as const;

type GapAnalysisResult = {
  match_score: number;
  matching_skills: string[];
  missing_skills: string[];
  recommendations: string[];
  experience_gap: string;
  education_fit: string;
  matched_evidence: string[];
  missing_evidence: string[];
  parse_failed: boolean;
  summary?: string;
  coverage_score?: number;
  matched_skills?: string[];
  stale?: boolean;
  status?: string;
  resume_version?: string;
  jd_version?: string;
  cached?: boolean;
  id?: string;
};

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

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9.+#\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Extract skills evidenced in text only — never invent skills not present. */
function extractSkillsFromText(text: string): string[] {
  const tokens = tokenize(text);
  const joined = text.toLowerCase();
  const found: string[] = [];
  for (const skill of KNOWN_SKILLS) {
    const needle = skill.toLowerCase();
    if (
      tokens.has(needle) ||
      tokens.has(needle.replace(".", "")) ||
      joined.includes(needle)
    ) {
      found.push(skill);
    }
  }
  return found.sort();
}

function skillsFromJdParsed(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") return [];
  const obj = parsed as Record<string, unknown>;
  const bags = [
    obj.required_skills,
    obj.skills,
    obj.must_have_skills,
    obj.keywords,
  ];
  const out: string[] = [];
  for (const bag of bags) {
    if (Array.isArray(bag)) {
      for (const item of bag) {
        const s = String(item ?? "").trim().toLowerCase();
        if (s) out.push(s);
      }
    }
  }
  return [...new Set(out)].sort();
}

function deterministicGapAnalysis(
  resumeText: string,
  jdText: string,
  jdParsed: unknown,
): GapAnalysisResult {
  const resumeSkills = extractSkillsFromText(resumeText);
  const fromParsed = skillsFromJdParsed(jdParsed);
  const jdSkills = fromParsed.length > 0 ? fromParsed : extractSkillsFromText(jdText);

  const resumeSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
  const jdSet = new Set(jdSkills.map((s) => s.toLowerCase()));
  const matched = [...resumeSet].filter((s) => jdSet.has(s)).sort();
  const missing = [...jdSet].filter((s) => !resumeSet.has(s)).sort();
  const coverage = jdSet.size > 0
    ? matched.length / jdSet.size
    : resumeSet.size > 0
    ? 1
    : 0;
  const matchScore = Math.round(coverage * 100);
  const summary =
    `Matched ${matched.length} of ${jdSet.size || matched.length} required skills ` +
    `(${matchScore}% coverage). ` +
    (missing.length > 0
      ? `Gaps: ${missing.slice(0, 8).join(", ")}.`
      : "No major skill gaps detected.");

  return {
    match_score: matchScore,
    matching_skills: matched,
    missing_skills: missing,
    recommendations: missing.length > 0
      ? missing.slice(0, 5).map((skill) => `Add evidence for: ${skill}`)
      : ["Keep quantifying impact with metrics from your resume."],
    experience_gap: missing.length > 0
      ? `Missing evidenced skills vs JD: ${missing.slice(0, 10).join(", ")}.`
      : "No clear experience gap from skill overlap.",
    education_fit: "Not assessed from skill-overlap heuristic.",
    matched_evidence: matched.map((s) => `Resume evidences: ${s}`),
    missing_evidence: missing.map((s) => `JD requires (not evidenced): ${s}`),
    parse_failed: false,
    summary,
    coverage_score: Math.round(coverage * 1000) / 1000,
    matched_skills: matched,
  };
}

function skillFromUnknown(item: unknown): string | null {
  if (typeof item === "string") {
    const t = item.replace(/\s+/g, " ").trim();
    if (!t || t === "[object Object]") return null;
    return t.slice(0, 200);
  }
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const row = item as Record<string, unknown>;
    for (const key of ["name", "skill", "label", "text", "title", "value"]) {
      const inner = row[key];
      if (typeof inner === "string") {
        const t = inner.replace(/\s+/g, " ").trim();
        if (t && t !== "[object Object]") return t.slice(0, 200);
      }
    }
  }
  return null;
}

function skillListFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const s = skillFromUnknown(item);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function normalizeHybridGap(raw: unknown): GapAnalysisResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const matching = Array.isArray(obj.matching_skills)
    ? skillListFromUnknown(obj.matching_skills)
    : Array.isArray(obj.matched_skills)
    ? skillListFromUnknown(obj.matched_skills)
    : null;
  const missing = Array.isArray(obj.missing_skills)
    ? skillListFromUnknown(obj.missing_skills)
    : null;
  if (!matching || !missing) return null;

  const coverageRaw = obj.coverage_score;
  const coverage =
    typeof coverageRaw === "number" && Number.isFinite(coverageRaw)
      ? coverageRaw <= 1
        ? coverageRaw
        : coverageRaw / 100
      : matching.length / Math.max(1, matching.length + missing.length);
  const matchScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        typeof obj.match_score === "number" && Number.isFinite(obj.match_score)
          ? Number(obj.match_score)
          : coverage * 100,
      ),
    ),
  );
  const recommendations = Array.isArray(obj.recommendations)
    ? obj.recommendations.map(String)
    : missing.slice(0, 5).map((skill) => `Add evidence for: ${skill}`);
  const summary = String(obj.summary ?? "").trim();

  return {
    match_score: matchScore,
    matching_skills: matching,
    missing_skills: missing,
    recommendations,
    experience_gap: String(obj.experience_gap ?? summary).slice(0, 2000),
    education_fit: String(obj.education_fit ?? "Not assessed from skill-overlap heuristic."),
    matched_evidence: Array.isArray(obj.matched_evidence)
      ? obj.matched_evidence.map(String)
      : matching.map((s) => `Resume evidences: ${s}`),
    missing_evidence: Array.isArray(obj.missing_evidence)
      ? obj.missing_evidence.map(String)
      : missing.map((s) => `JD requires (not evidenced): ${s}`),
    parse_failed: false,
    summary: summary || undefined,
    coverage_score: Math.round(coverage * 1000) / 1000,
    matched_skills: matching,
  };
}

function parseAiGap(text: string): GapAnalysisResult {
  let analysis: GapAnalysisResult = {
    match_score: 0,
    matching_skills: [],
    missing_skills: [],
    recommendations: [],
    experience_gap: "",
    education_fit: "",
    matched_evidence: [],
    missing_evidence: [],
    parse_failed: false,
  };
  let parseOk = false;

  try {
    const clean = text.replace(/```json|```/gi, "").trim();
    const parsed = JSON.parse(clean);
    const normalized = normalizeHybridGap(parsed);
    if (normalized) {
      analysis = normalized;
      parseOk = true;
    }
  } catch {
    try {
      const repaired = repairJsonString(text);
      const parsed = JSON.parse(repaired);
      const normalized = normalizeHybridGap(parsed);
      if (normalized) {
        analysis = normalized;
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
  return analysis;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "gap-analysis";

  try {
    const auth = await requireAuth(req);
    const userId = auth.userId;
    const db = getAdminClient();

    if (await isUserBanned(db, userId)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimited = await enforceAiRateLimitAsync(db, "gap-analysis", userId);
    if (rateLimited) return rateLimited;

    const capabilityGate = await requireCapabilityForFunction(auth.planId, FN, req);
    if (capabilityGate) return capabilityGate;

    const body = await parseBody<Record<string, unknown>>(req);

    if (!body || typeof body.resume_id !== "string" || typeof body.jd_id !== "string") {
      return errorResponse(
        "Invalid input. resume_id and jd_id are required.",
        "INVALID_REQUEST",
        400,
        req,
      );
    }

    const resume_id = body.resume_id.trim();
    const jd_id = body.jd_id.trim();
    const force_rerun = Boolean(body.force_rerun);

    if (!resume_id || !jd_id) {
      return errorResponse("Invalid IDs.", "INVALID_REQUEST", 400, req);
    }

    const { data: resume, error: rErr } = await db
      .from("resumes")
      .select("id, user_id, name, content, url, content_hash, created_at, updated_at")
      .eq("id", resume_id)
      .maybeSingle();

    if (rErr || !resume) {
      return errorResponse("Resume not found.", "RESUME_NOT_FOUND", 404, req);
    }
    if (resume.user_id !== userId) {
      return errorResponse(
        "You do not have permission to access this resume.",
        "OWNERSHIP_VIOLATION",
        403,
        req,
      );
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

    const { data: jd, error: jErr } = await db
      .from("job_descriptions")
      .select(
        "id, user_id, title, content, target_role, company, parsed_data, content_hash, updated_at, created_at",
      )
      .eq("id", jd_id)
      .maybeSingle();

    if (jErr || !jd) {
      return errorResponse("Job description not found.", "JD_NOT_FOUND", 404, req);
    }
    if (jd.user_id !== userId) {
      return errorResponse(
        "You do not have permission to access this job description.",
        "OWNERSHIP_VIOLATION",
        403,
        req,
      );
    }

    const jdContent = String(jd.content ?? "").trim();
    const jdParsed =
      jd.parsed_data && typeof jd.parsed_data === "object" &&
      Object.keys(jd.parsed_data as object).length > 0;
    if (jdContent.length < 20 && !jdParsed) {
      return errorResponse(
        "Job description parsing has not completed or contains no readable text.",
        "UNPARSED_JD",
        422,
        req,
      );
    }

    const resume_version = String(
      resume.content_hash || resume.updated_at || resume.created_at || "v1",
    ).slice(0, 100);
    const jd_version = String(
      jd.content_hash || jd.updated_at || jd.created_at || "v1",
    ).slice(0, 100);

    const safeResume = resumeContent.replace(/\u0000/g, "").slice(0, 3000);
    const safeJD = (jdContent || JSON.stringify(jd.parsed_data ?? {}, null, 2))
      .replace(/\u0000/g, "")
      .slice(0, 3000);

    const idempotencyKey =
      req.headers.get("x-idempotency-key") ||
      req.headers.get("Idempotency-Key") ||
      `gap_${userId}_${resume_id}_${jd_id}_${resume_version}_${jd_version}`;

    const hybrid = await executeHybridOperation<GapAnalysisResult>({
      req,
      auth,
      operation: "gap_analysis",
      idempotencyKey,
      creditCost: GAP_ANALYSIS_COST,
      creditAction: "gap_analysis",
      body: {
        resume_id,
        jd_id,
        resume_text: safeResume,
        jd_text: safeJD,
        resume_version,
        jd_version,
      },
      runDatabase: async () => {
        if (force_rerun) return null;
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
        if (!existing?.result) return null;
        const normalized = normalizeHybridGap(existing.result);
        if (!normalized) return null;
        return {
          ...normalized,
          id: existing.id,
          stale: false,
          status: "completed",
          resume_version,
          jd_version,
          cached: true,
        };
      },
      runDeterministic: async () =>
        deterministicGapAnalysis(safeResume, safeJD, jd.parsed_data),
      runPython: async (ctx) => {
        const py = await pythonExecuteOperation(
          {
            operation: "gap_analysis",
            operation_id: ctx.operationId,
            correlation_id: ctx.correlationId,
            user_id: userId,
            payload: {
              resume_text: safeResume,
              jd_text: safeJD,
              resume_skills: extractSkillsFromText(safeResume),
              jd_skills: skillsFromJdParsed(jd.parsed_data).length > 0
                ? skillsFromJdParsed(jd.parsed_data)
                : extractSkillsFromText(safeJD),
            },
          },
          { requestId: ctx.correlationId },
        );
        if (!py.ok) return null;
        const envelope = py.json as { data?: unknown } | unknown;
        const raw =
          envelope &&
            typeof envelope === "object" &&
            "data" in (envelope as Record<string, unknown>)
            ? (envelope as { data: unknown }).data
            : envelope;
        return normalizeHybridGap(raw);
      },
      runAi: async () => {
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

        const policy = getAiFeaturePolicy("gap_analysis");
        const aiResult = await generateWithFallback({
          prompt,
          maxTokens: Math.min(2048, policy.maxOutputTokens),
          temperature: 0.3,
          jsonMode: true,
          userId,
          action: "gap_analysis",
          skipSecondaryOnQuota: policy.skipSecondaryOnQuota,
        });
        if (!aiResult?.text) {
          throw new Error("Gap analysis AI returned empty output");
        }
        return parseAiGap(aiResult.text);
      },
      validate: (data) => {
        if (!data || typeof data !== "object") {
          throw new Error("Invalid gap analysis payload");
        }
        // Parsed-failed AI output is not a successful analysis.
        if (data.parse_failed && !data.cached) {
          throw new Error("Gap analysis parse failed");
        }
        return {
          ...data,
          resume_version,
          jd_version,
          status: data.cached
            ? "completed"
            : data.parse_failed
            ? "failed_recoverable"
            : "completed",
          stale: Boolean(data.parse_failed),
        };
      },
    });

    if (!hybrid.ok) {
      if (
        hybrid.code === "INSUFFICIENT_CREDITS" ||
        hybrid.code === "CAPABILITY_REQUIRED"
      ) {
        return hybrid.response;
      }
      const mapped = mapHybridDocumentCode(hybrid.code || "AI_PROVIDER_UNAVAILABLE");
      const envelopeCode =
        mapped === "MALFORMED_OUTPUT" || mapped === "PARSER_TIMEOUT"
          ? mapped
          : String(hybrid.code || "PROVIDER_UNAVAILABLE");
      const status =
        mapped === "MALFORMED_OUTPUT" || mapped === "PARSER_TIMEOUT" || mapped === "PARSER_UNAVAILABLE"
          ? httpStatusForDocumentError(mapped)
          : httpStatusForDomainCode(String(hybrid.code || "AI_PROVIDER_UNAVAILABLE"));
      const message =
        mapped === "MALFORMED_OUTPUT"
          ? "Gap analysis returned unusable output. Credits refunded. You can retry."
          : mapped === "PARSER_TIMEOUT"
          ? "Gap analysis timed out. Credits refunded. You can retry."
          : "Gap analysis unavailable. Credits refunded.";
      return errorResponse(message, envelopeCode, status, req);
    }

    const analysis = {
      ...hybrid.data,
      source: hybrid.source,
    };
    const parseOk = !analysis.parse_failed;

    if (!analysis.cached) {
      try {
        await db
          .from("gap_analyses")
          .update({
            stale: true,
            status: "stale",
            updated_at: new Date().toISOString(),
          })
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
    }

    log(FN, "info", "Gap analysis generated", {
      userId,
      resume_id,
      jd_id,
      source: hybrid.source,
      parseOk,
    });

    // Client expects flat analysis fields (fetchEdgeJson unwraps hybrid.data).
    return hybrid.response;
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    log(FN, "error", "resume-jd-analysis error", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500, req);
  }
});
