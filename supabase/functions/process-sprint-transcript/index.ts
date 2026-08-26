/**
 * process-sprint-transcript — MATRIX sprint_review_transcript hybrid wrapper.
 *
 * Replaces retired save-transcript for sprint review normalize/summary.
 * Body: { transcript, session_id? }
 * Order: deterministic → python speech_process → optional AI summary.
 */

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  parseBody,
  errorResponse,
  getAdminClient,
  log,
} from "../_shared/utils.ts";
import { isUserBanned, bannedResponse } from "../_shared/banCheck.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { executeHybridOperation } from "../_shared/hybridExecute.ts";
import { pythonExecuteOperation } from "../_shared/pythonClient.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";
import { DomainError } from "../_shared/domainErrors.ts";

const FN = "process-sprint-transcript";

type SprintTranscriptResult = {
  transcript: string;
  normalized: string;
  sentences: string[];
  sentence_count: number;
  word_count: number;
  summary: string;
  session_id: string | null;
  persisted: boolean;
};

function normalizeTranscript(raw: string): Omit<SprintTranscriptResult, "session_id" | "persisted"> {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const sentences = cleaned
    ? cleaned.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
    : [];
  return {
    transcript: cleaned,
    normalized: cleaned,
    sentences,
    sentence_count: sentences.length,
    word_count: cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0,
    summary: sentences.length ? sentences.slice(0, 2).join(" ") : cleaned.slice(0, 240),
  };
}

async function persistIfPossible(
  userId: string,
  sessionId: string | null,
  content: string,
): Promise<boolean> {
  if (!sessionId || !content) return false;
  try {
    const db = getAdminClient();
    const { data: session } = await db
      .from("sessions")
      .select("id, user_id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!session) return false;

    const { error } = await db.from("session_transcripts").insert({
      session_id: sessionId,
      user_id: userId,
      content: content.slice(0, 50_000),
      speaker: "user",
      is_final: true,
    });
    return !error;
  } catch (err) {
    log(FN, "warn", "session_transcripts persist skipped", {
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405, req);
  }

  try {
    const auth = await requireAuth(req);
    const userId = auth.userId;
    const db = getAdminClient();

    if (await isUserBanned(db, userId)) {
      return bannedResponse(getCorsHeaders(req));
    }

    const rateLimited = await enforceAiRateLimitAsync(db, FN, userId);
    if (rateLimited) return rateLimited;

    const capabilityGate = await requireCapabilityForFunction(
      auth.planId,
      FN,
      req,
    );
    if (capabilityGate) return capabilityGate;

    const body = await parseBody<Record<string, unknown>>(req);
    const transcriptRaw = typeof body?.transcript === "string" ? body.transcript : "";
    const sessionId =
      typeof body?.session_id === "string" && body.session_id.trim()
        ? body.session_id.trim()
        : typeof body?.sessionId === "string" && body.sessionId.trim()
        ? body.sessionId.trim()
        : null;

    if (!transcriptRaw.trim()) {
      return errorResponse(
        "transcript is required",
        "VALIDATION_ERROR",
        400,
        req,
      );
    }

    const idempotencyKey =
      req.headers.get("x-idempotency-key")?.trim() ||
      req.headers.get("Idempotency-Key")?.trim() ||
      null;

    const hybrid = await executeHybridOperation<SprintTranscriptResult>({
      req,
      auth,
      operation: "sprint_review_transcript",
      idempotencyKey,
      creditCost: 0,
      body: {
        transcript: transcriptRaw,
        session_id: sessionId,
      },
      runDeterministic: async () => {
        const base = normalizeTranscript(transcriptRaw);
        const persisted = await persistIfPossible(userId, sessionId, base.normalized);
        return { ...base, session_id: sessionId, persisted };
      },
      runPython: async (ctx) => {
        const py = await pythonExecuteOperation(
          {
            operation: "sprint_review_transcript",
            operation_id: ctx.operationId,
            correlation_id: ctx.correlationId,
            user_id: userId,
            input: {
              transcript: transcriptRaw,
              session_id: sessionId,
            },
          },
          { requestId: ctx.correlationId },
        );
        if (!py.ok) {
          throw new DomainError(
            py.errorCode ?? "PYTHON_SERVICE_UNAVAILABLE",
            py.errorMessage ?? "Python speech_process failed",
          );
        }
        const payload =
          py.json && typeof py.json === "object" && "data" in (py.json as object)
            ? (py.json as { data: Record<string, unknown> }).data
            : (py.json as Record<string, unknown> | null);
        const text = String(
          payload?.normalized ??
            payload?.transcript ??
            transcriptRaw,
        );
        const base = normalizeTranscript(text);
        const summary = String(payload?.summary ?? base.summary);
        const persisted = await persistIfPossible(userId, sessionId, base.normalized);
        return {
          ...base,
          summary,
          session_id: sessionId,
          persisted,
        };
      },
      runAi: async () => {
        const base = normalizeTranscript(transcriptRaw);
        let summary = base.summary;
        try {
          const ai = await generateWithFallback({
            prompt:
              `Summarize this interview sprint transcript in 1-2 short sentences. ` +
              `Do not invent facts.\n\n${base.normalized.slice(0, 4000)}`,
            maxTokens: 200,
            temperature: 0.3,
            userId,
            action: "sprint_review_transcript",
          });
          if (ai?.text?.trim()) summary = ai.text.trim().slice(0, 500);
        } catch {
          // AI optional — keep deterministic summary
        }
        const persisted = await persistIfPossible(userId, sessionId, base.normalized);
        return { ...base, summary, session_id: sessionId, persisted };
      },
    });

    return hybrid.response;
  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "Unhandled error", err);
    return errorResponse("Transcript processing failed.", "INTERNAL_ERROR", 500, req);
  }
});
