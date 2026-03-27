import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// delete-account — securely delete account and all linked data

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const db = createServiceClient();

    /* -------------------------------------------------------
       AUTHENTICATION (must verify real user)
    ------------------------------------------------------- */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const {
      data: { user },
      error: authErr,
    } = await db.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const authenticatedUserId = user.id;

    /* -------------------------------------------------------
       VALIDATE BODY
    ------------------------------------------------------- */
    const body = await req.json().catch(() => null);
    if (!body || typeof body.user_id !== "string") {
      return new Response(JSON.stringify({ error: "Invalid body" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const targetUserId = body.user_id;

    // IMPORTANT: Users can ONLY delete their own accounts
    if (targetUserId !== authenticatedUserId) {
      return new Response(
        JSON.stringify({ error: "Cannot delete another user's account" }),
        { status: 403, headers: corsHeaders }
      );
    }

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
          { status: 500, headers: corsHeaders }
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
        { status: 500, headers: corsHeaders }
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
      headers: corsHeaders,
    });

  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
