import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────
// export-user-data — GDPR-compliant full data export
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { user_id, type = "full" } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "Missing user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let exportData: Record<string, any> = {};

    if (type === "full" || type === "sessions") {
      const { data: sessions } = await db
        .from("sessions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false });
      exportData.sessions = sessions ?? [];
    }

    if (type === "full" || type === "transcripts") {
      const { data: answers } = await db
        .from("session_answers")
        .select("question_text, transcript, score, created_at")
        .in(
          "session_id",
          exportData.sessions?.map((s: any) => s.id) ?? ["none"]
        );
      exportData.transcripts = answers ?? [];
    }

    if (type === "full" || type === "answers") {
      const { data: bank } = await db
        .from("answer_bank")
        .select("*")
        .eq("user_id", user_id);
      exportData.answer_bank = bank ?? [];
    }

    if (type === "full" || type === "interviews") {
      const { data: interviews } = await db
        .from("interviews")
        .select("*")
        .eq("user_id", user_id);
      exportData.interviews = interviews ?? [];
    }

    if (type === "full") {
      const { data: profile } = await db
        .from("profiles")
        .select("full_name, email, plan, created_at, experience_level, target_role")
        .eq("id", user_id)
        .single();
      exportData.profile = profile;

      const { data: debriefs } = await db
        .from("session_debriefs")
        .select("*")
        .eq("user_id", user_id);
      exportData.debriefs = debriefs ?? [];
    }

    exportData.exported_at = new Date().toISOString();
    exportData.user_id     = user_id;

    const json    = JSON.stringify(exportData, null, 2);
    const encoder = new TextEncoder();
    const body    = encoder.encode(json);

    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type":        "application/json",
        "Content-Disposition": `attachment; filename="clarifyai-export-${type}.json"`,
      },
    });

  } catch (err) {
    console.error("export-user-data error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
