import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  enforceAccountDeletionRateLimit,
} from "../_shared/rateLimit.ts";

// delete-account — securely delete account and all linked data

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const authenticatedUserId = auth.context.user.id;
    const userEmail = auth.context.user.email;

    const rateLimited = enforceAccountDeletionRateLimit(authenticatedUserId);
    if (rateLimited) return rateLimited;

    const db = createServiceClient();

    /* -------------------------------------------------------
       VALIDATE BODY & CONFIRMATION
    ------------------------------------------------------- */
    const body = await req.json().catch(() => ({}));
    const confirmation = typeof body?.confirmation === "string"
      ? body.confirmation.trim()
      : "";

    if (confirmation !== "DELETE" && confirmation !== userEmail) {
      return new Response(
        JSON.stringify({
          error: "Confirmation required. Send { \"confirmation\": \"DELETE\" } or your email address to proceed.",
          code: "CONFIRMATION_REQUIRED",
        }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const targetUserId = authenticatedUserId;

    /* -------------------------------------------------------
       DELETE ALL USER DATA IN SAFE ORDER
    ------------------------------------------------------- */

    const deleteTables = [
      // Transactional / billing data
      "credit_transactions",
      "subscriptions",
      "payment_orders",
      // Session content
      "session_answers",
      "session_debriefs",
      "session_transcripts",
      // Feature data
      "answer_bank",
      "company_research",
      "interviews",
      "scheduled_interviews",
      "notifications",
      "referrals",
      "mock_tests",
      // Documents (before sessions to avoid FK issues)
      "documents",
      "resumes",
      // Core
      "sessions",
      "user_roles",
      // Profile last (FK target)
      "profiles",
    ];

    for (const table of deleteTables) {
      const col = table === "profiles" ? "id" : "user_id";
      const { error } = await db.from(table).delete().eq(col, targetUserId);
      if (error) {
        console.error(`Error deleting from ${table}:`, error);
        return new Response(
          JSON.stringify({ error: `Failed deleting ${table}`, code: "INTERNAL_ERROR" }),
          { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    }

    /* -------------------------------------------------------
       DELETE STORAGE FILES (with error handling)
    ------------------------------------------------------- */

    const buckets = ["resumes", "avatars"];
    for (const bucket of buckets) {
      const { data, error: listErr } = await db.storage
        .from(bucket)
        .list(targetUserId);

      if (listErr) {
        console.error(`Storage list error (${bucket}):`, listErr);
        continue;
      }

      if (data?.length) {
        const paths = data.map((f: any) => `${targetUserId}/${f.name}`);
        const { error: delErr } = await db.storage.from(bucket).remove(paths);

        if (delErr) {
          console.error(`Storage delete error (${bucket}):`, delErr);
        }
      }
    }

    /* -------------------------------------------------------
       DELETE AUTH USER LAST
    ------------------------------------------------------- */
    const { error: deleteErr } = await db.auth.admin.deleteUser(targetUserId);
    if (deleteErr) {
      console.error("auth delete error:", deleteErr);
      return new Response(
        JSON.stringify({ error: "Failed to delete auth user", code: "INTERNAL_ERROR" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    /* -------------------------------------------------------
       AUDIT LOG (optional)
    ------------------------------------------------------- */
    // Use service-role anon write since user is now deleted
    await db.from("audit_logs").insert({
      user_id: targetUserId,
      action: "account_deleted",
      metadata: { email: userEmail },
      created_at: new Date().toISOString(),
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(JSON.stringify({ error: "Internal error", code: "INTERNAL_ERROR" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
