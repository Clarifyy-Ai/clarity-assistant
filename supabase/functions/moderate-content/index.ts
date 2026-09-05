/**
 * Staff moderation (admin OR moderator). Least privilege:
 * hide/restore/resolve/lock/delete community posts, mark posts reported, resolve reports,
 * hide/restore questions. Does not grant user/billing/role/gov-exam admin.
 */
import { handleCors, applyCors } from "../_shared/cors.ts";
import { authenticateRequest, createServiceRoleClient, enforceStaff } from "../_shared/auth.ts";
import { errorResponse } from "../_shared/utils.ts";
import { checkRateLimitAsync, createRateLimitKey, RATE_LIMIT_PRESETS, rateLimitResponse } from "../_shared/rateLimit.ts";

const STAFF_ACTIONS = new Set([
  "hide_post",
  "restore_post",
  "resolve_post",
  "lock_post",
  "unlock_post",
  "delete_post",
  "delete_answer",
  "resolve_report",
  "dismiss_report",
  "hide_question",
  "restore_question",
]);

const USER_ACTIONS = new Set(["mark_post_reported"]);

const ACTIONS = new Set([...STAFF_ACTIONS, ...USER_ACTIONS]);

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405, req);
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  const db = createServiceRoleClient();
  const limited = await checkRateLimitAsync(db, {
    key: createRateLimitKey("moderate-content", auth.context.user.id),
    ...RATE_LIMIT_PRESETS.SESSION_ACTION,
  });
  if (!limited.allowed) return rateLimitResponse(limited, req);

  let body: { action?: string; target_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", "VALIDATION_ERROR", 400, req);
  }

  const action = String(body.action ?? "").trim();
  const targetId = String(body.target_id ?? "").trim();
  if (!ACTIONS.has(action) || !targetId) {
    return errorResponse("Unsupported moderation action.", "VALIDATION_ERROR", 400, req);
  }

  if (STAFF_ACTIONS.has(action)) {
    const staffGate = await enforceStaff(auth.context.user.id, req);
    if (staffGate) return staffGate;
  }

  async function resolveOpenReportsForTarget(targetType: string, targetIdForReports: string) {
    const { error } = await db
      .from("community_reports")
      .update({ status: "reviewed" })
      .eq("target_type", targetType)
      .eq("target_id", targetIdForReports)
      .eq("status", "open");
    if (error) throw new Error(error.message);
  }

  try {
  if (action === "hide_post" || action === "restore_post") {
    const status = action === "hide_post" ? "HIDDEN" : "PUBLISHED";
    const { error } = await db.from("community_posts").update({ status }).eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
    if (action === "hide_post") {
      await resolveOpenReportsForTarget("post", targetId);
    }
  } else if (action === "lock_post" || action === "unlock_post") {
    const { error } = await db
      .from("community_posts")
      .update({ locked: action === "lock_post" })
      .eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
  } else if (action === "delete_post") {
    await resolveOpenReportsForTarget("post", targetId);
    const { error } = await db.from("community_posts").delete().eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
  } else if (action === "delete_answer") {
    const { data: answer, error: fetchError } = await db
      .from("community_answers")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (fetchError) return errorResponse(fetchError.message, "DB_ERROR", 500, req);
    if (!answer) return errorResponse("Answer not found.", "NOT_FOUND", 404, req);
    await resolveOpenReportsForTarget("answer", targetId);
    const { error } = await db.from("community_answers").delete().eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
  } else if (action === "mark_post_reported") {
    const { data: post, error: fetchError } = await db
      .from("community_posts")
      .select("status")
      .eq("id", targetId)
      .maybeSingle();
    if (fetchError) return errorResponse(fetchError.message, "DB_ERROR", 500, req);
    if (!post) return errorResponse("Post not found.", "NOT_FOUND", 404, req);
    if (post.status !== "HIDDEN" && post.status !== "REPORTED") {
      const { error } = await db
        .from("community_posts")
        .update({ status: "REPORTED" })
        .eq("id", targetId);
      if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
    }
  } else if (action === "resolve_post") {
    const { error } = await db
      .from("community_posts")
      .update({ status: "RESOLVED" })
      .eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
    await resolveOpenReportsForTarget("post", targetId);
  } else if (action === "resolve_report") {
    const { data: report, error: fetchError } = await db
      .from("community_reports")
      .select("id,target_type,target_id,status")
      .eq("id", targetId)
      .maybeSingle();
    if (fetchError) return errorResponse(fetchError.message, "DB_ERROR", 500, req);
    if (!report) return errorResponse("Report not found.", "NOT_FOUND", 404, req);
    const { error } = await db
      .from("community_reports")
      .update({ status: "reviewed" })
      .eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
    if (report.target_type === "post") {
      const { data: post } = await db
        .from("community_posts")
        .select("status")
        .eq("id", report.target_id)
        .maybeSingle();
      if (post?.status === "REPORTED") {
        const { error: postError } = await db
          .from("community_posts")
          .update({ status: "RESOLVED" })
          .eq("id", report.target_id);
        if (postError) return errorResponse(postError.message, "DB_ERROR", 500, req);
      }
    }
  } else if (action === "dismiss_report") {
    const { data: report, error: fetchError } = await db
      .from("community_reports")
      .select("id,target_type,target_id")
      .eq("id", targetId)
      .maybeSingle();
    if (fetchError) return errorResponse(fetchError.message, "DB_ERROR", 500, req);
    if (!report) return errorResponse("Report not found.", "NOT_FOUND", 404, req);
    const { error } = await db
      .from("community_reports")
      .update({ status: "dismissed" })
      .eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
    if (report.target_type === "post") {
      const { data: openReports } = await db
        .from("community_reports")
        .select("id")
        .eq("target_type", "post")
        .eq("target_id", report.target_id)
        .eq("status", "open")
        .limit(1);
      if (!openReports?.length) {
        const { data: post } = await db
          .from("community_posts")
          .select("status")
          .eq("id", report.target_id)
          .maybeSingle();
        if (post?.status === "REPORTED") {
          await db
            .from("community_posts")
            .update({ status: "PUBLISHED" })
            .eq("id", report.target_id);
        }
      }
    }
  } else if (action === "hide_question" || action === "restore_question") {
    const publish = action === "restore_question" ? "published" : "hidden";
    const { error } = await db
      .from("questions")
      .update({
        publish_status: publish,
        review_status: action === "hide_question" ? "rejected" : "approved",
      })
      .eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
  }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Moderation action failed.";
    return errorResponse(message, "DB_ERROR", 500, req);
  }

  return applyCors(
    req,
    new Response(JSON.stringify({ ok: true, action, target_id: targetId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});
