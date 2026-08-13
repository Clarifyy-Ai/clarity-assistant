import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  enforceAccountDeletionRateLimitAsync,
} from "../_shared/rateLimit.ts";

// delete-account — securely delete account and all linked data

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

    /* -------------------------------------------------------
       VALIDATE BODY & CONFIRMATION
    ------------------------------------------------------- */
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
          current_step: "delete_rows",
          correlation_id: correlationId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", operationId);
    }

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
        if (operationId) {
          await db.from("account_deletion_operations").update({
            status: "partially_completed",
            current_step: table,
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
        const paths = data.map((f: { name: string }) => `${targetUserId}/${f.name}`);
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
