import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  enforceAccountDeletionRateLimitAsync,
} from "../_shared/rateLimit.ts";

function jsonWithCors(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return error?.code === "42P01" || error?.code === "PGRST205" || msg.includes("does not exist");
}

type WipeSpec = { table: string; column: string };

/**
 * DELETION_POLICY
 *
 * DELETE — private user-owned rows (practice, sessions, coach chat, documents).
 * ANONYMIZE — financial/audit rows that must remain for reconciliation.
 * RETAIN_REQUIRED — ops/audit telemetry; user_id SET NULL, row kept.
 * GLOBAL_SHARED — catalog content (questions, courses, templates); never delete
 *   rows. Attribution columns SET NULL via FK or explicit anonymize.
 *
 * Order matters: child/FK blockers (generated papers, coach messages, jobs)
 * are wiped before parents (paper jobs, conversations, library documents).
 */
const WIPE_TABLES: WipeSpec[] = [
  { table: "coach_messages", column: "user_id" },
  { table: "coach_conversations", column: "user_id" },
  { table: "practice_contexts", column: "user_id" },
  { table: "gov_generated_papers", column: "created_by" },
  { table: "gov_exam_requests", column: "user_id" },
  { table: "document_processing_jobs", column: "owner_id" },
  { table: "community_reports", column: "reporter_id" },
  { table: "companies", column: "user_id" },
  { table: "practice_rooms", column: "host_id" },
  { table: "rooms", column: "host_id" },
  { table: "session_ai_interactions", column: "user_id" },
  { table: "session_answers", column: "user_id" },
  { table: "session_debriefs", column: "user_id" },
  { table: "session_transcripts", column: "user_id" },
  { table: "scorecards", column: "user_id" },
  { table: "debriefs", column: "user_id" },
  { table: "transcripts", column: "user_id" },
  { table: "test_responses", column: "user_id" },
  { table: "test_analyses", column: "user_id" },
  { table: "mock_tests", column: "user_id" },
  { table: "gov_paper_generation_jobs", column: "user_id" },
  { table: "interview_day_checklists", column: "user_id" },
  { table: "interview_practice_plan_items", column: "user_id" },
  { table: "interview_practice_plans", column: "user_id" },
  { table: "scheduled_interviews", column: "user_id" },
  { table: "interviews", column: "user_id" },
  { table: "gap_analyses", column: "user_id" },
  { table: "job_descriptions", column: "user_id" },
  { table: "resumes", column: "user_id" },
  { table: "documents", column: "user_id" },
  { table: "personal_library_documents", column: "owner_id" },
  { table: "document_practice_sets", column: "owner_id" },
  { table: "practice_workspace_sessions", column: "user_id" },
  { table: "coding_submissions", column: "user_id" },
  { table: "course_enrollments", column: "user_id" },
  { table: "lesson_progress", column: "user_id" },
  { table: "quiz_progress", column: "user_id" },
  { table: "course_certificates", column: "user_id" },
  { table: "community_votes", column: "user_id" },
  { table: "community_comments", column: "user_id" },
  { table: "community_answers", column: "user_id" },
  { table: "community_posts", column: "user_id" },
  { table: "answer_bank", column: "user_id" },
  { table: "answers", column: "user_id" },
  { table: "saved_answers", column: "user_id" },
  { table: "company_research", column: "user_id" },
  { table: "calendar_integrations", column: "user_id" },
  { table: "notifications", column: "user_id" },
  { table: "user_achievements", column: "user_id" },
  { table: "user_badges", column: "user_id" },
  { table: "user_gov_exam_preferences", column: "user_id" },
  { table: "user_topic_performance", column: "user_id" },
  { table: "topic_mastery", column: "user_id" },
  { table: "exam_ranks", column: "user_id" },
  { table: "exam_readiness", column: "user_id" },
  { table: "revision_list", column: "user_id" },
  { table: "preparation_plans", column: "user_id" },
  { table: "coaching_context", column: "user_id" },
  { table: "feedback", column: "user_id" },
  { table: "analytics", column: "user_id" },
  { table: "ai_usage_logs", column: "user_id" },
  { table: "ai_free_tier_usage", column: "user_id" },
  { table: "ai_daily_costs", column: "user_id" },
  { table: "ai_test_runs", column: "user_id" },
  { table: "model_cost_logs", column: "user_id" },
  { table: "request_metrics", column: "user_id" },
  { table: "support_threads", column: "user_id" },
  { table: "room_chat", column: "user_id" },
  { table: "room_participants", column: "user_id" },
  { table: "credits", column: "user_id" },
  { table: "weekly_challenges", column: "user_id" },
  { table: "sessions", column: "user_id" },
  { table: "subscriptions", column: "user_id" },
  { table: "user_roles", column: "user_id" },
];

const STORAGE_BUCKETS = ["resumes", "avatars", "documents", "exports"];

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return withCorsHeaders(req, auth.error);
    const authenticatedUserId = auth.context.user.id;
    const userEmail = auth.context.user.email;

    const db = createServiceClient();
    const rateLimited = await enforceAccountDeletionRateLimitAsync(db, authenticatedUserId);
    if (rateLimited) return withCorsHeaders(req, rateLimited);

    const body = await req.json().catch(() => ({}));
    const confirmation = typeof body?.confirmation === "string"
      ? body.confirmation.trim()
      : "";

    if (confirmation !== "DELETE" && confirmation !== userEmail) {
      return jsonWithCors(
        req,
        {
          error: "Confirmation required. Send { \"confirmation\": \"DELETE\" } or your email address to proceed.",
          code: "CONFIRMATION_REQUIRED",
        },
        400,
      );
    }

    const targetUserId = authenticatedUserId;
    const correlationId =
      req.headers.get("x-request-id")?.trim() || crypto.randomUUID();

    const { data: existingOp } = await db
      .from("account_deletion_operations")
      .select("id, status")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOp?.status === "completed") {
      return jsonWithCors(req, {
        success: true,
        status: "completed",
        operationId: existingOp.id,
        correlationId,
      });
    }

    let operationId = existingOp?.id as string | undefined;
    if (!operationId) {
      const { data: created } = await db
        .from("account_deletion_operations")
        .insert({
          user_id: targetUserId,
          status: "identity_confirmed",
          correlation_id: correlationId,
          current_step: "confirmed",
        })
        .select("id")
        .single();
      operationId = created?.id;
    }

    if (operationId) {
      await db
        .from("account_deletion_operations")
        .update({
          status: "processing",
          current_step: "revoke_sessions",
          correlation_id: correlationId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", operationId);
    }

    await db.auth.admin.signOut(targetUserId, "global").catch(() => {});

    await db.from("referrals").delete().eq("referred_id", targetUserId);
    await db.from("referrals").delete().eq("referrer_id", targetUserId);

    for (const spec of WIPE_TABLES) {
      const { error } = await db.from(spec.table).delete().eq(spec.column, targetUserId);
      if (error && !isMissingRelation(error)) {
        console.error(`Error deleting from ${spec.table}:`, error);
        if (operationId) {
          await db.from("account_deletion_operations").update({
            status: "partially_completed",
            current_step: spec.table,
            error_code: "INTERNAL_ERROR",
            updated_at: new Date().toISOString(),
          }).eq("id", operationId);
        }
        return jsonWithCors(
          req,
          {
            error: "Failed to delete account data",
            code: "INTERNAL_ERROR",
            correlationId,
            operationId,
            status: "partially_completed",
          },
          500,
        );
      }
    }

    await db.from("payment_orders").update({
      user_id: null,
      metadata: { anonymized: true, deleted_at: new Date().toISOString() },
      promo_code: null,
    }).eq("user_id", targetUserId);

    await db.from("credit_transactions").update({
      description: "anonymized",
    }).eq("user_id", targetUserId);

    await db.from("billing_reconciliation_incidents").update({
      user_id: null,
      details: { anonymized: true },
    }).eq("user_id", targetUserId);

    // RETAIN_REQUIRED: ops provenance stays; drop the user pointer.
    await db.from("backend_operation_log").update({
      user_id: null,
    }).eq("user_id", targetUserId);

    await db.from("content_quality_incidents").update({
      reported_by: null,
      reporter_id: null,
    }).eq("reported_by", targetUserId);
    await db.from("content_quality_incidents").update({
      reporter_id: null,
    }).eq("reporter_id", targetUserId);

    await db.from("room_questions").update({ created_by: null }).eq("created_by", targetUserId);
    await db.from("promo_codes").update({ created_by: null }).eq("created_by", targetUserId);

    for (const bucket of STORAGE_BUCKETS) {
      const { data, error: listErr } = await db.storage.from(bucket).list(targetUserId);
      if (listErr || !data?.length) continue;
      const paths = data.map((f: { name: string }) => `${targetUserId}/${f.name}`);
      await db.storage.from(bucket).remove(paths);
    }

    const { error: profileErr } = await db.from("profiles").delete().eq("id", targetUserId);
    if (profileErr && !isMissingRelation(profileErr)) {
      console.error("profile delete error:", profileErr);
    }

    const { error: deleteErr } = await db.auth.admin.deleteUser(targetUserId);
    if (deleteErr && !String(deleteErr.message ?? "").toLowerCase().includes("not found")) {
      console.error("auth delete error:", deleteErr);
      if (operationId) {
        await db.from("account_deletion_operations").update({
          status: "failed",
          current_step: "auth_delete",
          error_code: "INTERNAL_ERROR",
          updated_at: new Date().toISOString(),
        }).eq("id", operationId);
      }
      return jsonWithCors(
        req,
        {
          error: "Failed to delete account",
          code: "INTERNAL_ERROR",
          correlationId,
          operationId,
          status: "failed",
        },
        500,
      );
    }

    await db.from("audit_logs").insert({
      user_id: null,
      action: "account_deleted",
      metadata: { correlationId },
      created_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    if (operationId) {
      await db.from("account_deletion_operations").update({
        status: "completed",
        current_step: "done",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", operationId);
    }

    return jsonWithCors(req, {
      success: true,
      status: "completed",
      operationId,
      correlationId,
    });
  } catch (err) {
    console.error("delete-account error:", err);
    return jsonWithCors(
      req,
      { error: "Internal error", code: "INTERNAL_ERROR" },
      500,
    );
  }
});
