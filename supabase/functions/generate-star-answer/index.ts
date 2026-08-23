// generate-star-answer/index.ts — hybrid-backed STAR generation


import {
  handleCors,
  parseBody,
  requireAuth,
  errorResponse,
  requireFields,
  log,
  getAdminClient,
} from "../_shared/utils.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import type { STARAnswer, ModelId } from "../_shared/types.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { requirePlan } from "../_shared/requirePlan.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import {
  AI_RESPONSE_INVALID,
  AI_RESPONSE_INVALID_MESSAGE,
  isStarStructuredAnswer,
  normalizeStarAnswer,
  parseStructuredJson,
  REPAIR_JSON_PROMPT,
} from "../_shared/structuredParse.ts";
import {
  assessStarFactualIntegrity,
  FACTUAL_INTEGRITY_SYSTEM_RULE,
} from "../_shared/factualIntegrity.ts";
import { executeHybridOperation } from "../_shared/hybridExecute.ts";
import { callPythonProcess } from "../_shared/pythonClient.ts";

function sanitize(input: unknown, max = 2000): string {
  return String(input ?? "")
    .replace(/```/g, "")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[\u0000-\u0008]/g, "")
    .replace(/[\u000B\u000C]/g, "")
    .replace(/[\u000E-\u001F]/g, "")
    .slice(0, max);
}

const ALLOWED_MODELS: ModelId[] = ["gpt-4o", "gpt-4o-mini", "gpt-4o-reasoning"];

function hasRichResumeEvidence(resumeText: string): boolean {
  const t = resumeText.trim();
  if (t.length < 120) return false;
  let signals = 0;
  if (/\d{4}/.test(t)) signals += 1;
  if (/(?:led|managed|built|developed|implemented|achieved|delivered)/i.test(t)) {
    signals += 1;
  }
  if (/(?:experience|project|role|team|company)/i.test(t)) signals += 1;
  if (/(?:\n|•|-\s)/.test(t)) signals += 1;
  return signals >= 3;
}

/** Format STAR from resume evidence only — no invented facts. */
function buildDeterministicStar(
  questionText: string,
  resumeText: string,
): STARAnswer | null {
  const preferDeterministic =
    (Deno.env.get("HYBRID_PREFER_DETERMINISTIC") ?? "").trim() === "1";

  if (!hasRichResumeEvidence(resumeText)) {
    if (!preferDeterministic) return null;
    const snippet = resumeText.trim().slice(0, 300) || "[NEEDS EVIDENCE]";
    return {
      situation: snippet,
      task: `Address: ${questionText}`,
      action: resumeText.trim().slice(0, 500) || "[NEEDS EVIDENCE]",
      result: "[Add measurable result if available]",
      fullAnswer: [
        `Situation: ${snippet}`,
        `Task: Address: ${questionText}`,
        `Action: ${resumeText.trim().slice(0, 500) || "[NEEDS EVIDENCE]"}`,
        "Result: [Add measurable result if available]",
      ].join("\n"),
    };
  }

  const lines = resumeText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const situation = lines[0]?.slice(0, 400) ?? resumeText.slice(0, 400);
  const actionBlock = lines.slice(1, 4).join(" ").slice(0, 600) || resumeText.slice(0, 600);

  return {
    situation,
    task: `Respond to the interview question: ${questionText}`,
    action: actionBlock,
    result: "[Add measurable result if available from resume]",
    fullAnswer: [
      `Situation: ${situation}`,
      `Task: Respond to the interview question: ${questionText}`,
      `Action: ${actionBlock}`,
      "Result: [Add measurable result if available from resume]",
    ].join("\n"),
  };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "generate-star-answer";

  try {
    const auth = await requireAuth(req);
    const userId = auth.userId;

    const rateLimited = await enforceAiRateLimitAsync(
      getAdminClient(),
      "generate-star-answer",
      userId,
    );
    if (rateLimited) return rateLimited;

    const planGate = requirePlan(auth.planId, "free", req);
    if (planGate) return planGate;

    const capabilityGate = requireCapabilityForFunction(auth.planId, FN, req);
    if (capabilityGate) return capabilityGate;

    const body = await parseBody<{
      questionText: string;
      resumeText?: string;
      jobDescription?: string;
      company?: string;
      role?: string;
      model?: ModelId;
    }>(req);

    const validation = requireFields(body as Record<string, unknown>, [
      "questionText",
    ]);
    if (!validation.valid) {
      return errorResponse(
        validation.errors[0].message,
        "VALIDATION_ERROR",
        400,
        req,
      );
    }

    const questionText = sanitize(body.questionText, 500);
    const resumeText = sanitize(body.resumeText, 4000);
    const jobDescription = sanitize(body.jobDescription, 2000);
    const company = sanitize(body.company, 120);
    const role = sanitize(body.role, 120);

    let model: ModelId = body.model ?? "gpt-4o";
    if (!ALLOWED_MODELS.includes(model)) model = "gpt-4o";

    const starCost = creditCost("star_builder");
    const idempotencyKey =
      req.headers.get("x-idempotency-key") ??
      req.headers.get("Idempotency-Key") ??
      null;

    const contextParts: string[] = [];
    if (resumeText) contextParts.push(`Resume / draft:\n${resumeText}`);
    if (jobDescription) contextParts.push(`Job Description:\n${jobDescription}`);
    if (company) contextParts.push(`Target Company: ${company}`);
    if (role) contextParts.push(`Target Role: ${role}`);

    const context =
      contextParts.length > 0
        ? `\n\n## Candidate Context\n${contextParts.join("\n\n")}`
        : "";

    const systemPrompt = `
You are an expert interview coach specialising in the STAR method.
Structure and polish a STAR-format answer using ONLY facts from the candidate context and question.
${FACTUAL_INTEGRITY_SYSTEM_RULE}
If the draft is thin, improve structure and language, and use [NEEDS EVIDENCE] or [Add measurable result if available] where facts are missing.
Return ONLY a valid JSON object — no quotes outside JSON, no markdown fences.
${context}
`.trim();

    const userPrompt = `
Produce a complete STAR answer for this behavioural interview question (preserve user facts; do not invent):

"${questionText}"

Return ONLY this JSON:
{
  "situation": "",
  "task": "",
  "action": "",
  "result": "",
  "fullAnswer": ""
}
`.trim();

    const sourceBaseline = [questionText, resumeText, jobDescription, company, role]
      .filter(Boolean)
      .join("\n");

    const hybridResult = await executeHybridOperation<STARAnswer & {
      source?: string;
      draft_kind?: string;
    }>({
      req,
      auth,
      operation: "star_builder",
      idempotencyKey,
      creditCost: starCost,
      creditAction: "generate_star",
      body: {
        questionText,
        resumeText,
        jobDescription,
        company,
        role,
        model,
      },
      runDeterministic: async () =>
        buildDeterministicStar(questionText, resumeText),
      runPython: async (ctx) => {
        const pythonStar = await callPythonProcess({
          operation: "star_evidence",
          operationId: ctx.operationId,
          correlationId: ctx.correlationId,
          payload: {
            situation: resumeText || questionText,
            task: role || questionText,
            action: resumeText || "",
            result: "",
            question: questionText,
            company,
            role,
            job_description: jobDescription,
            resume_text: resumeText,
          },
        });

        const pythonData =
          pythonStar.ok && pythonStar.data && typeof pythonStar.data === "object"
            ? (pythonStar.data as Record<string, unknown>)
            : null;
        const starDraft =
          pythonData?.star_draft && typeof pythonData.star_draft === "object"
            ? (pythonData.star_draft as Record<string, unknown>)
            : pythonData;

        const pythonNormalized = starDraft
          ? normalizeStarAnswer({
              situation: String(starDraft.situation ?? ""),
              task: String(starDraft.task ?? ""),
              action: String(starDraft.action ?? ""),
              result: String(starDraft.result ?? ""),
              fullAnswer: String(
                starDraft.fullAnswer ??
                  starDraft.full_answer ??
                  starDraft.draft ??
                  "",
              ),
            })
          : null;

        // Optional AI polish — keep python draft if AI fails (same credit lifecycle).
        try {
          const aiResult = await generateWithFallback({
            prompt: userPrompt,
            systemPrompt,
            maxTokens: 1200,
            temperature: 0.72,
            jsonMode: true,
            model: String(model),
            userId,
            action: "generate_star_answer",
          });
          if (aiResult?.text) {
            let parsed = parseStructuredJson(aiResult.text, isStarStructuredAnswer);
            if (!parsed.ok) {
              const repaired = await generateWithFallback({
                prompt: `${REPAIR_JSON_PROMPT}\n\nBroken output:\n${aiResult.text.slice(0, 4000)}`,
                systemPrompt,
                maxTokens: 1200,
                temperature: 0.2,
                jsonMode: true,
                model: String(model),
                userId,
                action: "generate_star_answer_repair",
              });
              parsed = parseStructuredJson(repaired.text, isStarStructuredAnswer);
            }
            const normalized = parsed.ok ? normalizeStarAnswer(parsed.value) : null;
            if (normalized) {
              const outputText = [
                normalized.situation,
                normalized.task,
                normalized.action,
                normalized.result,
                normalized.fullAnswer,
              ].join("\n");
              const factual = assessStarFactualIntegrity(sourceBaseline, outputText);
              if (factual.ok) {
                return { ...normalized, source: "ai", draft_kind: "polished" };
              }
            }
          }
        } catch (err) {
          log(FN, "warn", "STAR AI polish failed; using python draft", {
            userId,
            err: err instanceof Error ? err.message : String(err),
          });
        }

        if (!pythonNormalized) return null;
        return {
          ...pythonNormalized,
          source: "python",
          draft_kind: "input_based",
        };
      },
      runAi: async () => {
        let aiResult;
        try {
          aiResult = await generateWithFallback({
            prompt: userPrompt,
            systemPrompt,
            maxTokens: 1200,
            temperature: 0.72,
            jsonMode: true,
            model: String(model),
            userId,
            action: "generate_star_answer",
          });
        } catch {
          aiResult = null;
        }

        if (!aiResult?.text) {
          throw new Error("AI improvement is temporarily unavailable.");
        }

        let parsed = parseStructuredJson(aiResult.text, isStarStructuredAnswer);
        if (!parsed.ok) {
          log(FN, "warn", "STAR JSON parse failed; one repair retry", {
            category: parsed.category,
            length: parsed.length,
            model,
          });
          const repaired = await generateWithFallback({
            prompt: `${REPAIR_JSON_PROMPT}\n\nBroken output:\n${aiResult.text.slice(0, 4000)}`,
            systemPrompt,
            maxTokens: 1200,
            temperature: 0.2,
            jsonMode: true,
            model: String(model),
            userId,
            action: "generate_star_answer_repair",
          });
          parsed = parseStructuredJson(repaired.text, isStarStructuredAnswer);
        }

        const normalized = parsed.ok ? normalizeStarAnswer(parsed.value) : null;
        if (!normalized) {
          throw new Error(AI_RESPONSE_INVALID_MESSAGE);
        }

        const outputText = [
          normalized.situation,
          normalized.task,
          normalized.action,
          normalized.result,
          normalized.fullAnswer,
        ].join("\n");
        const factual = assessStarFactualIntegrity(sourceBaseline, outputText);
        if (!factual.ok) {
          throw new Error(AI_RESPONSE_INVALID_MESSAGE);
        }

        log(FN, "info", "STAR answer generated via AI", {
          userId,
          model,
          tokens: aiResult.totalTokens,
        });

        return { ...normalized, source: "ai", draft_kind: "polished" };
      },
      validate: async (data, source) => {
        if (source === "deterministic" || source === "python" || source === "fallback") {
          const outputText = [
            data.situation,
            data.task,
            data.action,
            data.result,
            data.fullAnswer,
          ].join("\n");
          const factual = assessStarFactualIntegrity(sourceBaseline, outputText);
          if (!factual.ok) {
            throw new Error(AI_RESPONSE_INVALID_MESSAGE);
          }
        }
        return data;
      },
      aiMeta: { provider: "openai", modelVersion: String(model) },
    });

    if (!hybridResult.ok) {
      if (hybridResult.code === AI_RESPONSE_INVALID) {
        return errorResponse(AI_RESPONSE_INVALID_MESSAGE, AI_RESPONSE_INVALID, 422, req);
      }
      return hybridResult.response;
    }

    return hybridResult.response;
  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "Unhandled error", err);
    return errorResponse(
      "Failed to generate STAR answer.",
      "INTERNAL_ERROR",
      500,
      req,
    );
  }
});
