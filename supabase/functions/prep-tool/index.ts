// prep-tool/index.ts — FIXED, SECURE, PRODUCTION-READY

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  successResponse,
  errorResponse,
  log,
  getAdminClient,
} from "../_shared/utils.ts";
import {
  createServiceClient,
  deductCreditsAtomic,
  getIdempotentResponse,
  refundCredits,
  storeIdempotentResponse,
} from "../_shared/supabase.ts";
import { generateWithFallback, logAICost } from "../_shared/aiProvider.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { requirePlan } from "../_shared/requirePlan.ts";

import {
  AI_RESPONSE_INVALID,
  AI_RESPONSE_INVALID_MESSAGE,
  isRephraseAlternatives,
  parseStructuredJson,
  REPAIR_JSON_PROMPT,
  type RephraseAlternatives,
} from "../_shared/structuredParse.ts";
import { creditDenialResponse } from "../_shared/creditAuthority.ts";
import {
  assessStarFactualIntegrity,
  FACTUAL_INTEGRITY_SYSTEM_RULE,
  isValidSystemDesignOutput,
} from "../_shared/factualIntegrity.ts";
import { callPythonProcess, pythonExecuteOperation } from "../_shared/pythonClient.ts";
import { executeHybridOperation } from "../_shared/hybridExecute.ts";
import {
  classifyAiFailure,
  httpStatusForDomainCode,
} from "../_shared/domainErrors.ts";
import { creditCost } from "../_shared/creditEconomics.ts";

function structuredError(
  req: Request,
  message: string,
  code:
    | "PROVIDER_UNAVAILABLE"
    | "INTERNAL_ERROR"
    | "AI_RESPONSE_INVALID"
    | "INVALID_RESPONSE"
    | "RATE_LIMITED",
  status: number,
  correlationId: string,
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      code,
      correlation_id: correlationId,
    }),
    {
      status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    },
  );
}

/** Map AI-layer failures to prep-tool envelope + domain HTTP status (never 502 / never AUTH). */
function aiFailureEnvelope(err: unknown): {
  code: "PROVIDER_UNAVAILABLE" | "AI_RESPONSE_INVALID" | "INVALID_RESPONSE" | "RATE_LIMITED";
  status: number;
  message: string;
} {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/429|rate.?limit|too many requests/i.test(msg)) {
    return {
      code: "RATE_LIMITED",
      status: 429,
      message: "AI rate limit reached. Please try again shortly. Credits refunded.",
    };
  }
  const domain = classifyAiFailure(err);
  if (domain === "AI_INVALID_OUTPUT") {
    return {
      code: "INVALID_RESPONSE",
      status: httpStatusForDomainCode(domain),
      message: AI_RESPONSE_INVALID_MESSAGE,
    };
  }
  return {
    code: "PROVIDER_UNAVAILABLE",
    status: httpStatusForDomainCode(domain),
    message: "AI service temporarily unavailable. Credits refunded.",
  };
}

function isProviderFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /missing required|missing.*env|api.?key|GEMINI|OPENAI|ANTHROPIC|provider|unavailable|timeout|ECONNREFUSED|fetch failed|network/i
    .test(msg);
}

/** Map hybrid/domain failure codes → prep-tool public codes (never AUTH_*). */
function hybridPublicFailure(
  req: Request,
  hybridCode: string,
  correlationId: string,
  unavailableMessage: string,
): Response {
  if (
    hybridCode === "INSUFFICIENT_CREDITS" ||
    hybridCode === "CAPABILITY_REQUIRED" ||
    hybridCode === "PAYMENT_REQUIRED"
  ) {
    // Caller should return hybrid.response for credit/capability envelopes.
    return structuredError(
      req,
      unavailableMessage,
      "PROVIDER_UNAVAILABLE",
      httpStatusForDomainCode("AI_PROVIDER_UNAVAILABLE"),
      correlationId,
    );
  }
  if (
    hybridCode === AI_RESPONSE_INVALID ||
    hybridCode === "AI_INVALID_OUTPUT" ||
    hybridCode === "INVALID_RESPONSE"
  ) {
    return structuredError(
      req,
      AI_RESPONSE_INVALID_MESSAGE,
      "INVALID_RESPONSE",
      422,
      correlationId,
    );
  }
  if (hybridCode === "RATE_LIMITED" || hybridCode === "AI_TIMEOUT") {
    return structuredError(
      req,
      hybridCode === "RATE_LIMITED"
        ? "AI rate limit reached. Please try again shortly. Credits refunded."
        : "AI request timed out. Please try again. Credits refunded.",
      hybridCode === "RATE_LIMITED" ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      hybridCode === "RATE_LIMITED" ? 429 : httpStatusForDomainCode("AI_TIMEOUT"),
      correlationId,
    );
  }
  return structuredError(
    req,
    unavailableMessage,
    "PROVIDER_UNAVAILABLE",
    httpStatusForDomainCode(
      String(hybridCode || "AI_PROVIDER_UNAVAILABLE"),
    ),
    correlationId,
  );
}

function parseStarSections(input: string): {
  situation: string;
  task: string;
  action: string;
  result: string;
} {
  const text = String(input ?? "");
  const grab = (label: string): string => {
    const re = new RegExp(
      `${label}\\s*:\\s*([\\s\\S]*?)(?=(?:Situation|Task|Action|Result)\\s*:|$)`,
      "i",
    );
    const m = text.match(re);
    return (m?.[1] ?? "").trim();
  };
  const situation = grab("Situation");
  const task = grab("Task");
  const action = grab("Action");
  const result = grab("Result");
  if (situation || task || action || result) {
    return { situation, task, action, result };
  }
  // Unlabeled draft — treat whole input as action narrative.
  return { situation: "", task: "", action: text.slice(0, 2500), result: "" };
}

function formatStarDraft(parts: {
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
  full_answer?: string;
  draft?: string;
}): string {
  if (typeof parts.draft === "string" && parts.draft.trim()) return parts.draft.trim();
  if (typeof parts.full_answer === "string" && parts.full_answer.trim()) {
    return parts.full_answer.trim();
  }
  return [
    `Situation: ${parts.situation ?? ""}`,
    `Task: ${parts.task ?? ""}`,
    `Action: ${parts.action ?? ""}`,
    `Result: ${parts.result ?? ""}`,
  ].join("\n\n").trim();
}

function formatStarDraftFromPython(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const obj = data as Record<string, unknown>;
  const starDraft =
    obj.star_draft && typeof obj.star_draft === "object"
      ? (obj.star_draft as Record<string, unknown>)
      : null;
  if (starDraft) {
    return formatStarDraft({
      situation: typeof starDraft.situation === "string" ? starDraft.situation : "",
      task: typeof starDraft.task === "string" ? starDraft.task : "",
      action: typeof starDraft.action === "string" ? starDraft.action : "",
      result: typeof starDraft.result === "string" ? starDraft.result : "",
    });
  }
  return formatStarDraft(obj as Record<string, string>);
}

function buildSystemDesignTemplate(input: string): {
  result: string;
  diagram_spec: null;
} {
  const words = input
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter((w) => w.length > 3)
    .slice(0, 10);
  const topic = words.length > 0 ? words.join(", ") : "the requested system";

  const result = [
    "## 1. Requirements",
    `- Functional: core flows for ${topic}`,
    "- Non-functional: availability, latency, consistency (state assumptions)",
    "",
    "## 2. High-level architecture",
    "- Client → API gateway → services → data stores",
    `- Partition by domain keywords: ${topic}`,
    "",
    "## 3. Data model",
    "- Entities, IDs, indexes, and hot read/write paths",
    "",
    "## 4. Scaling",
    "- Horizontal scale, caching, async workers, backpressure",
    "",
    "## 5. Tradeoffs",
    "- CAP/consistency choices; cost vs complexity",
    "",
    "## 6. What to mention in interview",
    "- Requirements clarification, bottlenecks, observability, failure modes",
  ].join("\n");

  return { result, diagram_spec: null };
}

function formatSystemDesignFromPython(data: unknown): {
  result: string;
  diagram_spec: unknown | null;
} | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const diagram_spec = obj.diagram_spec ?? obj.diagramSpec ?? null;
  const narrative =
    (typeof obj.outline === "string" && obj.outline) ||
    (typeof obj.narrative === "string" && obj.narrative) ||
    (typeof obj.design === "string" && obj.design) ||
    (typeof obj.result === "string" && obj.result) ||
    (typeof obj.text === "string" && obj.text) ||
    "";
  if (narrative.trim().length >= 80) {
    return { result: narrative.trim(), diagram_spec };
  }
  const sections = obj.sections;
  if (sections && typeof sections === "object") {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(sections as Record<string, unknown>)) {
      lines.push(`## ${key}`);
      lines.push(typeof value === "string" ? value : JSON.stringify(value));
      lines.push("");
    }
    const joined = lines.join("\n").trim();
    if (joined.length >= 80) return { result: joined, diagram_spec };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*                          SANITIZATION HELPERS                              */
/* -------------------------------------------------------------------------- */

function sanitizeInput(text: string, max = 2500): string {
  return String(text ?? "")
    .replace(/```/g, "") // remove code fences
    // Strip control chars only — keep Unicode (Hindi, smart quotes, etc.)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, max)
    .trim();
}

function sanitizeAIOutput(text: string): string {
  return String(text ?? "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

/* -------------------------------------------------------------------------- */
/*                         PER-TOOL CREDIT COSTS                              */
/* -------------------------------------------------------------------------- */

type PrepToolId =
  | "coding_hint"
  | "coding_solution"
  | "rephrase"
  | "project_build"
  | "star_method"
  | "system_design"
  | "jd_fit"
  | "question_predict"
  | "cover_letter"
  | "salary_coach"
  | "linkedin_headline"
  | "culture_fit";

const PREP_TOOL_IDS = new Set<string>([
  "coding_hint",
  "coding_solution",
  "rephrase",
  "project_build",
  "star_method",
  "system_design",
  "jd_fit",
  "question_predict",
  "cover_letter",
  "salary_coach",
  "linkedin_headline",
  "culture_fit",
]);

const TOOL_COSTS: Partial<Record<PrepToolId, number>> = {
  coding_hint:     creditCost("coding_hint"),
  coding_solution: creditCost("live_answer"),
  rephrase:        creditCost("rephraser"),
  project_build:   creditCost("project_builder"),
  star_method:     creditCost("star_builder"),
  system_design:   creditCost("system_design"),
};

function isPrepToolId(value: string): value is PrepToolId {
  return PREP_TOOL_IDS.has(value);
}

function getToolCost(tool_id: PrepToolId): number {
  return TOOL_COSTS[tool_id] ?? creditCost("rephraser");
}

function cleanupInterviewText(text: string): string {
  return text
    .replace(/\b(um+|uh+|like|you know)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deterministicRephrase(input: string): RephraseAlternatives {
  const cleaned = cleanupInterviewText(input);
  return {
    formal: cleaned,
    confident: cleaned.replace(/\bi think\b/gi, "I know").replace(/\bmaybe\b/gi, ""),
    concise: cleaned.split(/\s+/).slice(0, Math.max(12, Math.floor(cleaned.split(/\s+/).length * 0.7))).join(" "),
  };
}

function deterministicCodingContent(input: string, mode: "hint" | "solution"): string {
  const hints = [
    "Clarify inputs, outputs, and edge cases before coding",
    "State time/space complexity targets",
    "Start with a brute-force approach, then optimize",
  ];
  if (mode === "hint") {
    return "• " + hints.join("\n• ");
  }
  return (
    `Problem: ${input.slice(0, 400) || "(describe the problem)"}\n\n` +
    "Approach outline:\n" +
    "1. Parse constraints and examples\n" +
    "2. Choose a data structure that matches access patterns\n" +
    "3. Implement, then test edge cases (empty, single, large)\n"
  );
}

function deterministicProjectContent(input: string): string {
  const topic = input.slice(0, 80) || "portfolio project";
  return [
    `Project outline: ${topic}`,
    "",
    `Problem: Define the user problem for: ${topic}`,
    "Scope: MVP features (3–5); Out of scope list; Success metrics",
    "Architecture: Client; API; Data store; Auth",
    "Milestones: Spike; MVP; Polish; Demo",
  ].join("\n");
}

function formatProjectFromPython(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title : "";
  const sections = obj.sections && typeof obj.sections === "object"
    ? obj.sections as Record<string, unknown>
    : null;
  if (!title && !sections) return null;
  const lines: string[] = [];
  if (title) lines.push(title, "");
  if (sections) {
    for (const [key, value] of Object.entries(sections)) {
      lines.push(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
  }
  const joined = lines.join("\n").trim();
  return joined.length >= 20 ? joined : null;
}

function extractPythonPayload(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;
  if ("data" in (json as Record<string, unknown>)) {
    return (json as { data: unknown }).data;
  }
  return json;
}

/* -------------------------------------------------------------------------- */
/*                              TOOL PROMPTS                                  */
/* -------------------------------------------------------------------------- */

const TOOL_PROMPTS: Record<string, (input: string) => string> = {
  jd_fit: (input) => `
Analyse this resume/profile against the job description below.
Rate the fit (0-100) and provide a detailed gap analysis.

${input}

Return plain text ONLY with:
Fit Score: X/100
Strong matches: (list)
Gaps to address: (list)
Recommendation: (2-3 sentences)
`,

  question_predict: (input) => `
Based on this job description/company info, predict the 10 most
likely interview questions. Include behavioural, technical, and culture fit.

${input}

Format:
1. Question — why it's likely
2. ...
`,

  cover_letter: (input) => `
Write a tailored, concise 3-paragraph cover letter (<300 words).
Professional tone. Do NOT start with "I am writing to apply...".

${input}
`,

  salary_coach: (input) => `
Create a personalised salary negotiation script. Include:
- opening line
- counter-offer language
- handling pushback
- closing

${input}
`,

  linkedin_headline: (input) => `
Write 5 LinkedIn headline options (<120 characters each).
Keyword-rich and role specific.

${input}
`,

  culture_fit: (input) => `
Analyse how well this candidate aligns with the company's values.
Score (0-100) and explanation.

${input}
`,

  coding_hint: (input) => `
You are a coding interview coach. Give a progressive hint for this problem based on the requested depth level embedded in the input.
- "surface": general direction, data structure to consider, do NOT reveal the algorithm
- "medium": explain the key insight and approach, but not the full solution
- "near-complete": explain the algorithm step by step in detail, including edge cases

${input}
`,

  coding_solution: (input) => `
Explain the optimal solution in interview style.
Include approach, complexity, and edge cases.
NO code.

${input}
`,

  system_design: (input) => `
Provide a detailed system design breakdown with clearly labeled sections:
## 1. Requirements
## 2. High-level architecture
## 3. Data model
## 4. Scaling
## 5. Tradeoffs
## 6. What to mention in interview

Use markdown ## headings for each section. Be concrete and interview-ready.

${input}
`,

  rephrase: (input) => `
Rephrase this interview answer in exactly 3 distinct styles.
Return ONLY valid JSON — no markdown fences, no extra text outside the JSON object.

{
  "formal": "polished, professional, precise version here",
  "confident": "assertive, direct, strong-impact version here",
  "concise": "shorter, punchy, trimmed-down version here"
}

Answer to rephrase:
${input}
`,

  project_build: (input) => `
Create a polished project showcase with:
- overview
- key achievements
- tech rationale
- challenges overcome
- STAR-format version
- 3 follow-up questions + answers

${input}
`,

  star_method: (input) => `
Improve this STAR interview answer. Keep it authentic and specific.
${FACTUAL_INTEGRITY_SYSTEM_RULE}
Polish the language, flow, and impact. Quantify results only when the user provided numbers.
Return the improved version with all 4 sections clearly labeled:

Situation: ...
Task: ...
Action: ...
Result: ...

${input}
`,

  raw_prompt: (input) => input,
};

/* -------------------------------------------------------------------------- */
/*                                  HANDLER                                   */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "prep-tool";
  const correlationId = crypto.randomUUID();

  try {
    /* ----------------------- AUTH ----------------------- */
    const auth   = await requireAuth(req);
    const userId = auth.userId;

    const rateLimited = await enforceAiRateLimitAsync(
      getAdminClient(),
      "prep-tool",
      userId,
    );
    if (rateLimited) return withCorsHeaders(req, rateLimited);

    const planGate = requirePlan(auth.planId, "free", req);
    if (planGate) return planGate;

    const capabilityGate = await requireCapabilityForFunction(auth.planId, FN, req);
    if (capabilityGate) return capabilityGate;

    /* ----------------------- BODY ----------------------- */
    const body = await req.json().catch(() => null);
    if (!body || typeof body.tool_id !== "string" || typeof body.input !== "string") {
      return errorResponse("Missing tool_id or input", "INVALID_REQUEST", 400, req);
    }

    const { tool_id: rawToolId } = body;
    if (!isPrepToolId(rawToolId)) {
      return errorResponse(`Unknown tool_id: ${rawToolId}`, "INVALID_TOOL", 400, req);
    }
    const tool_id: PrepToolId = rawToolId;

    const promptFn = TOOL_PROMPTS[tool_id];
    if (!promptFn) {
      return errorResponse(`Unknown tool_id: ${tool_id}`, "INVALID_TOOL", 400, req);
    }

    // For coding_hint, prepend depth level to input if provided
    let rawInput = body.input;
    if (tool_id === "coding_hint" && typeof body.depth === "string") {
      const depth = sanitizeInput(body.depth, 20);
      rawInput = `Depth level: ${depth}\n\n${rawInput}`;
    }

    const sanitizedInput = sanitizeInput(rawInput);
    if (sanitizedInput.length < 3) {
      return errorResponse(
        "Input is empty or too short after sanitization.",
        "INVALID_REQUEST",
        400,
        req,
      );
    }

    /* ------------------- CREDIT DEDUCTION ------------------- */
    const toolCost = getToolCost(tool_id);
    // Prefer x-idempotency-key / Idempotency-Key; never invent a random key
    // (that defeats client retries and can double-charge). When omitted, use a
    // stable request-hash key so retries share one reservation.
    const suppliedIdempotencyKey =
      req.headers.get("x-idempotency-key") ??
      req.headers.get("Idempotency-Key") ??
      req.headers.get("idempotency-key") ??
      null;
    const requestHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${tool_id}\n${sanitizedInput}`),
    ).then((digest) =>
      Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
    );
    const idempotencyKey =
      (suppliedIdempotencyKey && suppliedIdempotencyKey.trim()) ||
      `${tool_id}:${userId}:${requestHash}`.slice(0, 150);

    // Full-result replay: same key already completed → no second charge / AI call.
    const db = createServiceClient();
    const prior = await getIdempotentResponse(db, idempotencyKey, {
      userId,
      action: `prep_tool_${tool_id}`,
      requestHash,
    });
    const priorPayload = prior?.success ? prior.payload : null;
    if (priorPayload && priorPayload.parse_status !== "failed_invalid_response") {
      log(FN, "info", "Prep tool idempotent replay", {
        userId,
        tool_id,
        correlationId,
      });
      return successResponse(
        {
          result: priorPayload.result,
          alternatives: priorPayload.alternatives,
          source: priorPayload.source ?? "ai",
          draft_kind: priorPayload.draft_kind,
          diagram_spec: priorPayload.diagram_spec ?? null,
          cached: true,
        },
        { creditsCharged: 0 },
        200,
        req,
      );
    }

    /* ----------------------- PROMPT ----------------------- */
    const prompt = promptFn(sanitizedInput);

    /* ---- Hybrid path: star_method → star_builder (credits via executeHybridOperation) ---- */
    if (tool_id === "star_method") {
      type StarMethodPayload = {
        result: string;
        alternatives: null;
        source: string;
        draft_kind?: string;
        situation?: string;
        task?: string;
        action?: string;
        result_section?: string;
      };

      const starParts = parseStarSections(sanitizedInput);

      /** Python STAR draft staged for AI polish (runPython skips success per matrix). */
      let pythonStarMethodDraft: StarMethodPayload | null = null;

      const hybrid = await executeHybridOperation<StarMethodPayload>({
        req,
        auth,
        operation: "star_builder",
        idempotencyKey,
        creditCost: toolCost,
        creditAction: `prep_tool_${tool_id}`,
        body: { input: sanitizedInput, tool_id, ...starParts },
        runDeterministic: async () => {
          if (pythonStarMethodDraft?.result?.trim()) {
            return pythonStarMethodDraft;
          }
          let draft = formatStarDraft(starParts);
          if (!starParts.result.trim()) {
            draft += "\n\nResult: [Add measurable result if available]";
          }
          if (!draft.trim()) return null;
          return {
            result: draft,
            alternatives: null,
            source: "deterministic",
            draft_kind: "input_based",
            situation: starParts.situation,
            task: starParts.task,
            action: starParts.action,
            result_section: starParts.result || "[Add measurable result if available]",
          };
        },
        runPython: async (ctx) => {
          const pythonStar = await callPythonProcess({
            operation: "star_evidence",
            operationId: ctx.operationId,
            correlationId: ctx.correlationId,
            payload: {
              operation_type: "star_method",
              ...starParts,
              input: sanitizedInput,
            },
          });
          let pythonDraft = "";
          if (pythonStar.ok && pythonStar.data) {
            pythonDraft = formatStarDraftFromPython(pythonStar.data);
          }
          if (!pythonDraft.trim()) return null;
          if (!starParts.result.trim() && !/Result\s*:/i.test(pythonDraft)) {
            pythonDraft += "\n\nResult: [Add measurable result if available]";
          }
          const parsed = parseStarSections(pythonDraft);
          pythonStarMethodDraft = {
            result: pythonDraft,
            alternatives: null,
            source: "python",
            draft_kind: "input_based",
            situation: parsed.situation,
            task: parsed.task,
            action: parsed.action,
            result_section: parsed.result,
          };
          // Defer success to runAi — matrix order is python → ai → deterministic.
          return null;
        },
        runAi: async () => {
          const polishPrompt = pythonStarMethodDraft
            ? `${prompt}\n\nStructured draft to polish (preserve facts; do not invent):\n${pythonStarMethodDraft.result}`
            : prompt;
          const ai = await generateWithFallback({
            prompt: polishPrompt,
            maxTokens: 1200,
            temperature: 0.6,
            userId,
            action: `prep_tool_${tool_id}`,
          });
          const aiText = sanitizeAIOutput(ai.text ?? "");
          if (!aiText.trim()) {
            throw new Error("AI returned empty STAR polish.");
          }
          const factual = assessStarFactualIntegrity(sanitizedInput, aiText);
          if (!factual.ok) {
            throw new Error(AI_RESPONSE_INVALID_MESSAGE);
          }
          const parsed = parseStarSections(aiText);
          return {
            result: aiText,
            alternatives: null,
            source: "ai",
            draft_kind: "polished",
            situation: parsed.situation,
            task: parsed.task,
            action: parsed.action,
            result_section: parsed.result,
          };
        },
        validate: async (data) => {
          if (!data.result?.trim()) {
            throw new Error(AI_RESPONSE_INVALID_MESSAGE);
          }
          if (data.source === "ai") {
            const factual = assessStarFactualIntegrity(sanitizedInput, data.result);
            if (!factual.ok) {
              throw new Error(AI_RESPONSE_INVALID_MESSAGE);
            }
          }
          return data;
        },
      });

      if (!hybrid.ok) {
        await db.from("idempotency_log").delete().eq("key", idempotencyKey);
        if (
          hybrid.code === "INSUFFICIENT_CREDITS" ||
          hybrid.code === "CAPABILITY_REQUIRED"
        ) {
          return hybrid.response;
        }
        return hybridPublicFailure(
          req,
          String(hybrid.code ?? ""),
          correlationId,
          "STAR drafting is temporarily unavailable. Credits refunded.",
        );
      }

      const payload = hybrid.data;
      await storeIdempotentResponse(db, idempotencyKey, {
        success: true,
        payload: {
          result: payload.result,
          alternatives: null,
          tool_id,
          parse_status: "completed",
          source: payload.source,
          draft_kind: payload.draft_kind,
          situation: payload.situation,
          task: payload.task,
          action: payload.action,
          result_section: payload.result_section,
        },
      }, {
        userId,
        action: `prep_tool_${tool_id}`,
        requestHash,
      });

      return hybrid.response;
    }

    /* ---- Hybrid path: system_design (credits via executeHybridOperation) ---- */
    if (tool_id === "system_design") {
      type SystemDesignPayload = {
        result: string;
        alternatives: null;
        source: string;
        diagram_spec: unknown | null;
      };

      const hybrid = await executeHybridOperation<SystemDesignPayload>({
        req,
        auth,
        operation: "system_design",
        idempotencyKey,
        creditCost: toolCost,
        creditAction: `prep_tool_${tool_id}`,
        body: { input: sanitizedInput, tool_id },
        runDeterministic: async () => {
          const tpl = buildSystemDesignTemplate(sanitizedInput);
          if (tpl.result.length < 80) return null;
          return {
            result: tpl.result,
            alternatives: null,
            source: "deterministic",
            diagram_spec: tpl.diagram_spec,
          };
        },
        runAi: async () => {
          const ai = await generateWithFallback({
            prompt,
            maxTokens: 1200,
            temperature: 0.6,
            userId,
            action: `prep_tool_${tool_id}`,
          });
          const aiText = sanitizeAIOutput(ai.text ?? "");
          if (!aiText || !isValidSystemDesignOutput(aiText)) {
            throw new Error("AI system design output invalid.");
          }
          return {
            result: aiText,
            alternatives: null,
            source: "ai",
            diagram_spec: null,
          };
        },
        runPython: async (ctx) => {
          const py = await callPythonProcess({
            operation: "system_design",
            operationId: ctx.operationId,
            correlationId: ctx.correlationId,
            payload: { input: sanitizedInput, prompt: sanitizedInput },
          });
          const formatted = py.ok ? formatSystemDesignFromPython(py.data) : null;
          if (!formatted?.result) return null;
          return {
            result: formatted.result,
            alternatives: null,
            source: "python",
            diagram_spec: formatted.diagram_spec,
          };
        },
        validate: async (data) => {
          if (!data.result || !isValidSystemDesignOutput(data.result)) {
            throw new Error(AI_RESPONSE_INVALID_MESSAGE);
          }
          return data;
        },
      });

      if (!hybrid.ok) {
        await db.from("idempotency_log").delete().eq("key", idempotencyKey);
        if (
          hybrid.code === "INSUFFICIENT_CREDITS" ||
          hybrid.code === "CAPABILITY_REQUIRED"
        ) {
          return hybrid.response;
        }
        return hybridPublicFailure(
          req,
          String(hybrid.code ?? ""),
          correlationId,
          "System design is temporarily unavailable.",
        );
      }

      const payload = hybrid.data;
      await storeIdempotentResponse(db, idempotencyKey, {
        success: true,
        payload: {
          result: payload.result,
          alternatives: null,
          tool_id,
          parse_status: "completed",
          source: payload.source,
          diagram_spec: payload.diagram_spec,
        },
      }, {
        userId,
        action: `prep_tool_${tool_id}`,
        requestHash,
      });

      return hybrid.response;
    }

    /* ---- Hybrid: rephrase / coding_* / project_build ---- */
    const HYBRID_PREP_OPS: Record<string, "prep_rephrase" | "prep_coding" | "prep_project"> = {
      rephrase: "prep_rephrase",
      coding_hint: "prep_coding",
      coding_solution: "prep_coding",
      project_build: "prep_project",
    };
    const hybridOp = HYBRID_PREP_OPS[tool_id];
    if (hybridOp) {
      type PrepHybridPayload = {
        result: string;
        alternatives: RephraseAlternatives | null;
        source: string;
      };

      const codingMode =
        tool_id === "coding_solution" ? "solution" : "hint";

      const hybrid = await executeHybridOperation<PrepHybridPayload>({
        req,
        auth,
        operation: hybridOp,
        idempotencyKey,
        creditCost: toolCost,
        creditAction: `prep_tool_${tool_id}`,
        body: {
          text: sanitizedInput,
          input: sanitizedInput,
          prompt: sanitizedInput,
          topic: sanitizedInput,
          mode: codingMode,
          tool_id,
        },
        runDeterministic: async () => {
          if (tool_id === "rephrase") {
            const alternatives = deterministicRephrase(sanitizedInput);
            return {
              result: JSON.stringify(alternatives),
              alternatives,
              source: "deterministic",
            };
          }
          if (tool_id === "project_build") {
            return {
              result: deterministicProjectContent(sanitizedInput),
              alternatives: null,
              source: "deterministic",
            };
          }
          return {
            result: deterministicCodingContent(
              sanitizedInput,
              codingMode === "solution" ? "solution" : "hint",
            ),
            alternatives: null,
            source: "deterministic",
          };
        },
        runPython: async (ctx) => {
          const py = await pythonExecuteOperation(
            {
              operation: hybridOp,
              operation_id: ctx.operationId,
              correlation_id: ctx.correlationId,
              user_id: userId,
              payload: {
                text: sanitizedInput,
                input: sanitizedInput,
                prompt: sanitizedInput,
                topic: sanitizedInput,
                mode: codingMode,
              },
            },
            { requestId: ctx.correlationId },
          );
          if (!py.ok) return null;
          const raw = extractPythonPayload(py.json);
          if (!raw || typeof raw !== "object") return null;
          const obj = raw as Record<string, unknown>;

          if (tool_id === "rephrase") {
            const rephrased = String(obj.rephrased ?? "").trim();
            if (!rephrased) return null;
            const alternatives = deterministicRephrase(rephrased);
            return {
              result: JSON.stringify(alternatives),
              alternatives,
              source: "python",
            };
          }
          if (tool_id === "project_build") {
            const result = formatProjectFromPython(raw);
            if (!result) return null;
            return { result, alternatives: null, source: "python" };
          }
          const content = String(obj.content ?? "").trim();
          if (!content) return null;
          return { result: content, alternatives: null, source: "python" };
        },
        runAi: async () => {
          const ai = await generateWithFallback({
            prompt,
            maxTokens: 1200,
            temperature: 0.6,
            jsonMode: tool_id === "rephrase",
            userId,
            action: `prep_tool_${tool_id}`,
          });
          const raw = ai.text ?? "";
          if (!raw.trim()) throw new Error("AI returned empty response");

          if (tool_id === "rephrase") {
            let parsed = parseStructuredJson(raw, isRephraseAlternatives);
            if (!parsed.ok) {
              const repaired = await generateWithFallback({
                prompt: `${REPAIR_JSON_PROMPT}\n\nOriginal answer:\n${sanitizedInput}\n\nBroken output:\n${raw.slice(0, 4000)}`,
                maxTokens: 1200,
                temperature: 0.2,
                jsonMode: true,
                userId,
                action: `prep_tool_${tool_id}_repair`,
              });
              parsed = parseStructuredJson(repaired.text, isRephraseAlternatives);
            }
            if (!parsed.ok || !parsed.value) {
              throw new Error(AI_RESPONSE_INVALID_MESSAGE);
            }
            return {
              result: JSON.stringify(parsed.value),
              alternatives: parsed.value,
              source: "ai",
            };
          }

          return {
            result: sanitizeAIOutput(raw),
            alternatives: null,
            source: "ai",
          };
        },
        validate: (data) => {
          if (!data?.result?.trim()) {
            throw new Error("Empty prep-tool result");
          }
          if (tool_id === "rephrase") {
            const alts = data.alternatives ??
              parseStructuredJson(data.result, isRephraseAlternatives).value;
            if (!alts) throw new Error(AI_RESPONSE_INVALID_MESSAGE);
            return { ...data, alternatives: alts };
          }
          return data;
        },
      });

      if (!hybrid.ok) {
        await db.from("idempotency_log").delete().eq("key", idempotencyKey);
        if (
          hybrid.code === "INSUFFICIENT_CREDITS" ||
          hybrid.code === "CAPABILITY_REQUIRED"
        ) {
          return hybrid.response;
        }
        return hybridPublicFailure(
          req,
          String(hybrid.code ?? ""),
          correlationId,
          "Prep tool is temporarily unavailable.",
        );
      }

      const payload = hybrid.data;
      await storeIdempotentResponse(db, idempotencyKey, {
        success: true,
        payload: {
          result: payload.result,
          alternatives: payload.alternatives,
          tool_id,
          parse_status: "completed",
          source: payload.source ?? hybrid.source,
        },
      }, {
        userId,
        action: `prep_tool_${tool_id}`,
        requestHash,
      });

      return hybrid.response;
    }

    const creditResult = await deductCreditsAtomic({
      userId,
      action: `prep_tool_${tool_id}`,
      cost: toolCost,
      idempotencyKey,
      requestHash,
    });
    if (!creditResult.success) {
      return creditDenialResponse(req, creditResult, toolCost);
    }

    /* ----------------------- AI CALL ----------------------- */
    let raw: string;
    let usedModel = "gemini-2.0-flash";
    const aiStartMs = Date.now();
    try {
      const ai = await generateWithFallback({
        prompt,
        maxTokens: 1200,
        temperature: 0.6,
        jsonMode: tool_id === "rephrase",
        userId,
        action: `prep_tool_${tool_id}`,
      });
      raw = ai.text;
      usedModel = ai.model;
      if (!raw || raw.trim().length === 0) {
        throw new Error("AI returned empty response");
      }
    } catch (aiErr) {
      await refundCredits({
        userId,
        cost: toolCost,
        reason: `prep-tool AI call failure (${tool_id})`,
      });
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      log(FN, "error", "AI call failed, credits refunded", {
        userId,
        tool_id,
        err: errMsg.slice(0, 500),
        domain: classifyAiFailure(aiErr),
      });
      const envelope = aiFailureEnvelope(aiErr);
      return structuredError(
        req,
        envelope.message,
        envelope.code,
        envelope.status,
        correlationId,
      );
    }

    void logAICost(getAdminClient(), {
      userId,
      action: `prep_tool_${tool_id}`,
      model: usedModel,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(raw.length / 4),
      latencyMs: Date.now() - aiStartMs,
      wasFallback: false,
    });

    let alternatives: RephraseAlternatives | null = null;
    let cleaned = sanitizeAIOutput(raw);

    if (tool_id === "rephrase") {
      let parsed = parseStructuredJson(raw, isRephraseAlternatives);
      if (!parsed.ok) {
        log(FN, "warn", "Rephrase JSON parse failed; one repair retry", {
          category: parsed.category,
          length: parsed.length,
          correlationId,
          model: usedModel,
          operation: tool_id,
        });
        try {
          const repaired = await generateWithFallback({
            prompt: `${REPAIR_JSON_PROMPT}\n\nOriginal answer:\n${sanitizedInput}\n\nBroken output:\n${raw.slice(0, 4000)}`,
            maxTokens: 1200,
            temperature: 0.2,
            jsonMode: true,
            userId,
            action: `prep_tool_${tool_id}_repair`,
          });
          parsed = parseStructuredJson(repaired.text, isRephraseAlternatives);
        } catch {
          parsed = { ok: false, value: null, category: "unavailable", length: raw.length };
        }
      }
      if (!parsed.ok || !parsed.value) {
        await refundCredits({
          userId,
          cost: toolCost,
          reason: "prep-tool rephrase invalid JSON",
        });
        await storeIdempotentResponse(db, idempotencyKey, {
          success: false,
          error: AI_RESPONSE_INVALID,
          payload: { parse_status: "failed_invalid_response", tool_id },
        } as never, {
          userId,
          action: `prep_tool_${tool_id}`,
          requestHash,
        });
        return structuredError(
          req,
          AI_RESPONSE_INVALID_MESSAGE,
          "INVALID_RESPONSE",
          422,
          correlationId,
        );
      }
      alternatives = parsed.value;
      cleaned = JSON.stringify(alternatives);
    }

    await storeIdempotentResponse(db, idempotencyKey, {
      success: true,
      balanceAfter: creditResult.balanceAfter,
      transactionId: creditResult.transactionId,
      payload: {
        result: cleaned,
        alternatives,
        tool_id,
        parse_status: "completed",
        source: "ai",
      },
    }, {
      userId,
      action: `prep_tool_${tool_id}`,
      requestHash,
    });

    log(FN, "info", "Prep tool executed", {
      userId,
      tool_id,
      inputLength: sanitizedInput.length,
      correlationId,
    });

    return successResponse(
      {
        result: cleaned,
        alternatives,
        source: "ai",
      },
      { creditsCharged: toolCost },
      200,
      req
    );
  } catch (err) {
    if (err instanceof Response) {
      // Auth / rate-limit / plan gates throw Response — pass through unchanged
      // so provider outages never masquerade as AUTH_*.
      return withCorsHeaders(req, err);
    }
    const errMsg = err instanceof Error ? err.message : String(err ?? "");
    console.error("prep-tool error:", { correlationId, err: errMsg.slice(0, 500) });
    // Never map provider/config failures to AUTH_EXPIRED / AUTH_REQUIRED.
    if (isProviderFailure(err)) {
      return structuredError(
        req,
        "AI service temporarily unavailable. Please try again.",
        "PROVIDER_UNAVAILABLE",
        httpStatusForDomainCode("AI_PROVIDER_UNAVAILABLE"),
        correlationId,
      );
    }
    return structuredError(
      req,
      "Internal error",
      "INTERNAL_ERROR",
      500,
      correlationId,
    );
  }
});
