// supabase/functions/issue-share-token/index.ts
// Authoritative shareability gate + idempotent scorecard share token issue/revoke.

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJsonBody } from "../_shared/errors.ts";
import {
  isScoredScorecardRow,
  resolveSessionShareability,
  type SessionShareabilityCode,
} from "../_shared/sessionShareability.ts";

const bodySchema = z.object({
  session_id: z.string().uuid("Invalid session ID."),
  action: z.enum(["issue", "revoke", "status"]).optional().default("issue"),
});

function json(corsHeaders: HeadersInit, status: number, body: unknown): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function httpStatusForShareCode(code: SessionShareabilityCode): number {
  switch (code) {
    case "SHARE_READY":
      return 200;
    case "SHARE_DISABLED":
      return 403;
    case "SESSION_INCOMPLETE":
    case "SESSION_ABANDONED":
    case "SCORECARD_REQUIRED":
      return 422;
    default:
      return 422;
  }
}

function parsePrivacyShareAllowed(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
  const prefs = raw as Record<string, unknown>;
  if (!("share_scorecard" in prefs)) return true;
  return prefs.share_scorecard === true;
}

function hasMeaningfulAnswer(row: { answer?: unknown }): boolean {
  const text = String(row.answer ?? "").trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  if (lower === "[skipped]" || lower === "skipped" || lower === "pass") return false;
  return text.length >= 1;
}

function hasShareableDebrief(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  const status = String(row.status ?? "").toLowerCase();
  if (status === "completed") return true;
  const report = row.detailed_report;
  return Boolean(report && typeof report === "object");
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return json(corsHeaders, 405, {
        error: "Method not allowed.",
        code: "METHOD_NOT_ALLOWED",
      });
    }

    const auth = await authenticateRequest(req);
    if (auth.error) return withCorsHeaders(req, auth.error);
    const { user } = auth.context;

    let rawBody: unknown;
    try {
      rawBody = await parseJsonBody(req);
    } catch {
      return json(corsHeaders, 400, {
        error: "Invalid JSON payload.",
        code: "BAD_REQUEST",
      });
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json(corsHeaders, 422, {
        error: "Validation failed.",
        code: "VALIDATION_ERROR",
      });
    }

    const { session_id: sessionId, action } = parsed.data;
    const db = createServiceClient();

    const { data: sessionRow, error: sessionError } = await db
      .from("sessions")
      .select("id,user_id,status,lifecycle_status,terminal_reason,ended_at")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (sessionError || !sessionRow) {
      return json(corsHeaders, 404, {
        error: "Session not found.",
        code: "SESSION_NOT_FOUND",
      });
    }

    if (action === "revoke") {
      const { error: directErr } = await db
        .from("scorecards")
        .update({ is_shared: false, share_token: null })
        .eq("session_id", sessionId)
        .eq("user_id", user.id);
      if (directErr) {
        console.error("[issue-share-token] revoke:", directErr);
        return json(corsHeaders, 500, {
          error: "Could not revoke share link.",
          code: "INTERNAL_ERROR",
        });
      }
      return json(corsHeaders, 200, {
        success: true,
        revoked: true,
        session_id: sessionId,
      });
    }

    const { data: profile } = await db
      .from("profiles")
      .select("privacy_prefs")
      .eq("id", user.id)
      .maybeSingle();

    const { data: answersData } = await db
      .from("session_answers")
      .select("answer")
      .eq("session_id", sessionId)
      .eq("user_id", user.id);

    const scorableAnswerCount = ((answersData ?? []) as Array<{ answer?: unknown }>).filter(
      hasMeaningfulAnswer,
    ).length;

    const { data: scorecard } = await db
      .from("scorecards")
      .select(
        "id,overall_score,evaluation_status,score_status,is_shared,share_token",
      )
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: debrief } = await db
      .from("session_debriefs")
      .select("id,status,detailed_report")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    const shareability = resolveSessionShareability({
      status: sessionRow.status,
      lifecycle_status: sessionRow.lifecycle_status,
      terminal_reason: sessionRow.terminal_reason,
      ended_at: sessionRow.ended_at,
      scorableAnswerCount,
      privacyShareAllowed: parsePrivacyShareAllowed(profile?.privacy_prefs),
      hasScoredScorecard: isScoredScorecardRow(scorecard as Record<string, unknown> | null),
      hasShareableDebrief: hasShareableDebrief(debrief as Record<string, unknown> | null),
    });

    if (action === "status") {
      return json(corsHeaders, 200, {
        success: true,
        session_id: sessionId,
        completion: shareability.completion,
        code: shareability.code,
        message: shareability.message,
        shareable: shareability.shareable,
        session_completed: shareability.sessionCompleted,
        is_shared: Boolean(scorecard?.is_shared),
        share_token: scorecard?.share_token ?? null,
      });
    }

    if (!shareability.shareable) {
      return json(corsHeaders, httpStatusForShareCode(shareability.code), {
        success: false,
        error: shareability.message,
        code: shareability.code,
        completion: shareability.completion,
        session_completed: shareability.sessionCompleted,
        session_id: sessionId,
      });
    }

    // Prefer existing token (idempotent).
    const existingToken =
      typeof scorecard?.share_token === "string" && scorecard.share_token.trim().length >= 16
        ? scorecard.share_token.trim()
        : null;

    if (existingToken) {
      if (!scorecard?.is_shared) {
        await db
          .from("scorecards")
          .update({ is_shared: true })
          .eq("session_id", sessionId)
          .eq("user_id", user.id);
      }
      return json(corsHeaders, 200, {
        success: true,
        idempotent: true,
        session_id: sessionId,
        share_token: existingToken,
        share_url_path: `/share/${existingToken}`,
        code: "SHARE_READY",
        completion: shareability.completion,
      });
    }

    // Mint new token via service role after shareability passed.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const minted = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    const { error: updateError } = await db
      .from("scorecards")
      .update({ is_shared: true, share_token: minted })
      .eq("session_id", sessionId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[issue-share-token] mint:", updateError);
      return json(corsHeaders, 500, {
        error: "Could not create share link.",
        code: "INTERNAL_ERROR",
      });
    }

    return json(corsHeaders, 200, {
      success: true,
      idempotent: false,
      session_id: sessionId,
      share_token: minted,
      share_url_path: `/share/${minted}`,
      code: "SHARE_READY",
      completion: shareability.completion,
    });
  } catch (err) {
    console.error("[issue-share-token]", err);
    return json(corsHeaders, 500, {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
    });
  }
});
