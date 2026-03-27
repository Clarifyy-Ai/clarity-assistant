// export-user-data/index.ts — FIXED & SECURE VERSION

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const db = createServiceClient();

    /* ---------------------------------------------------
       AUTHENTICATION (REQUIRED)
    --------------------------------------------------- */
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
      error: userErr
    } = await db.auth.getUser(token);

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    /* ---------------------------------------------------
       VALIDATE BODY
    --------------------------------------------------- */
    const body = await req.json().catch(() => null);
    const { user_id, type = "full" } = body ?? {};

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // User can export ONLY their own data
    if (user.id !== user_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    /* ---------------------------------------------------
       START EXPORT STRUCT
    --------------------------------------------------- */
    const exportData: Record<string, any> = {};
    let sessionIds: string[] = [];

    /* ---------------------------------------------------
       EXPORT SESSIONS
    --------------------------------------------------- */
    if (type === "full" || type === "sessions" || type === "transcripts") {
      const { data: sessions, error: sErr } = await db
        .from("sessions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false });

      if (sErr) throw sErr;

      exportData.sessions = sessions ?? [];
      sessionIds = sessions?.map((s: any) => s.id) ?? [];
    }

    /* ---------------------------------------------------
       EXPORT TRANSCRIPTS
    --------------------------------------------------- */
    if (type === "full" || type === "transcripts") {
      const ids = sessionIds.length ? sessionIds : ["-no-sessions-"];

      const { data: answers, error: aErr } = await db
        .from("session_answers")
        .select("question_text, transcript, score, created_at")
        .in("session_id", ids);

      if (aErr) throw aErr;

      exportData.transcripts = answers ?? [];
    }

    /* ---------------------------------------------------
       ANSWER BANK
    --------------------------------------------------- */
    if (type === "full" || type === "answers") {
      const { data: bank, error: bErr } = await db
        .from("answer_bank")
        .select("*")
        .eq("user_id", user_id);

      if (bErr) throw bErr;

      exportData.answer_bank = bank ?? [];
    }

    /* ---------------------------------------------------
       INTERVIEWS
    --------------------------------------------------- */
    if (type === "full" || type === "interviews") {
      const { data: interviews, error: iErr } = await db
        .from("interviews")
        .select("*")
        .eq("user_id", user_id);

      if (iErr) throw iErr;

      exportData.interviews = interviews ?? [];
    }

    /* ---------------------------------------------------
       PROFILE + DEBRIEFS
    --------------------------------------------------- */
    if (type === "full") {
      const { data: profile, error: pErr } = await db
        .from("profiles")
        .select(
          "full_name, email, plan, created_at, experience_level, target_role"
        )
        .eq("id", user_id)
        .single();

      if (pErr) throw pErr;

      exportData.profile = profile;

      const { data: debriefs, error: dErr } = await db
        .from("session_debriefs")
        .select("*")
        .eq("user_id", user_id);

      if (dErr) throw dErr;

      exportData.debriefs = debriefs ?? [];
    }

    /* ---------------------------------------------------
       FINAL METADATA
    --------------------------------------------------- */
    exportData.exported_at = new Date().toISOString();
    exportData.user_id = user_id;

    /* ---------------------------------------------------
       AUDIT LOG (Optional but recommended)
    --------------------------------------------------- */
    db.from("audit_logs")
      .insert({
        user_id,
        event: "export_user_data",
        created_at: new Date().toISOString(),
      })
      .catch(() => {});

    /* ---------------------------------------------------
       RETURN FILE
    --------------------------------------------------- */
    const jsonBlob = JSON.stringify(exportData, null, 2);
    const encoded = new TextEncoder().encode(jsonBlob);

    return new Response(encoded, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="clarify-ai-export-${type}.json"`,
      },
    });
  } catch (err) {
    console.error("[export-user-data] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
