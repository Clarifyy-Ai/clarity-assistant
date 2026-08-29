/**
 * Staff moderation (admin OR moderator). Least privilege:
 * hide/restore/lock/delete community posts, resolve reports, hide/restore questions.
 * Does not grant user/billing/role/gov-exam admin.
 */
import { handleCors, applyCors } from "../_shared/cors.ts";
import { authenticateRequest, createServiceRoleClient, enforceStaff } from "../_shared/auth.ts";
import { errorResponse } from "../_shared/utils.ts";
import { checkRateLimitAsync, createRateLimitKey, RATE_LIMIT_PRESETS, rateLimitResponse } from "../_shared/rateLimit.ts";

const ACTIONS = new Set([
  "hide_post",
  "restore_post",
  "lock_post",
  "unlock_post",
  "delete_post",
  "resolve_report",
  "hide_question",
  "restore_question",
]);

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405, req);
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;
  const staffGate = await enforceStaff(auth.context.user.id, req);
  if (staffGate) return staffGate;

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

  if (action === "hide_post" || action === "restore_post") {
    const status = action === "hide_post" ? "HIDDEN" : "PUBLISHED";
    const { error } = await db.from("community_posts").update({ status }).eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
  } else if (action === "lock_post" || action === "unlock_post") {
    const { error } = await db
      .from("community_posts")
      .update({ locked: action === "lock_post" })
      .eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
  } else if (action === "delete_post") {
    const { error } = await db.from("community_posts").delete().eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
  } else if (action === "resolve_report") {
    const { error } = await db
      .from("community_reports")
      .update({ status: "reviewed" })
      .eq("id", targetId);
    if (error) return errorResponse(error.message, "DB_ERROR", 500, req);
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

  return applyCors(
    req,
    new Response(JSON.stringify({ ok: true, action, target_id: targetId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});
