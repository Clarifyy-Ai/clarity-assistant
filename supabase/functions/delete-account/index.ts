import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────
// delete-account — permanently delete all user data
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "Missing user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete in dependency order
    const tables = [
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

    for (const table of tables) {
      const col = table === "profiles" ? "id" : "user_id";
      await db.from(table).delete().eq(col, user_id);
    }

    // Delete storage files
    await db.storage.from("resumes").list(user_id).then(async ({ data }) => {
      if (data?.length) {
        await db.storage.from("resumes").remove(
          data.map((f: any) => `${user_id}/${f.name}`)
        );
      }
    });

    await db.storage.from("avatars").list(user_id).then(async ({ data }) => {
      if (data?.length) {
        await db.storage.from("avatars").remove(
          data.map((f: any) => `${user_id}/${f.name}`)
        );
      }
    });

    // Delete auth user last
    await db.auth.admin.deleteUser(user_id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
