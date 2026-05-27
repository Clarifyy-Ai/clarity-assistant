import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// delete-account — securely delete account and all linked data

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const authenticatedUserId = auth.context.user.id;
    const db = createServiceClient();

    /* -------------------------------------------------------
       VALIDATE BODY
    ------------------------------------------------------- */
    const targetUserId = authenticatedUserId;

    /* -------------------------------------------------------
       DELETE ALL USER DATA IN SAFE ORDER
    ------------------------------------------------------- */

    const deleteTables = [
      "credit_transactions",
      "session_answers",
      "session_debriefs",
      "answer_bank",
      "company_research",
      "interviews",
      "documents",
      "sessions",
      "profiles",
    ];

    for (const table of deleteTables) {
      const col = table === "profiles" ? "id" : "user_id";
      const { error } = await db.from(table).delete().eq(col, targetUserId);
      if (error) {
        console.error(`Error deleting from ${table}:`, error);
        return new Response(
          JSON.stringify({ error: `Failed deleting ${table}` }),
          { status: 500, headers: getCorsHeaders(req) }
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
        JSON.stringify({ error: "Failed to delete auth user" }),
        { status: 500, headers: getCorsHeaders(req) }
      );
    }

    /* -------------------------------------------------------
       AUDIT LOG (optional)
    ------------------------------------------------------- */
    await db.from("audit_logs").insert({
      user_id: targetUserId,
      event: "account_deleted",
      created_at: new Date().toISOString(),
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true }), {
      headers: getCorsHeaders(req) });

  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: getCorsHeaders(req) });
  }
});
