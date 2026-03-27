import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    /* ---------------------------
       AUTHENTICATE USER SAFELY
    --------------------------- */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";

    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders } }
      );
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const db = createServiceClient();

    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders } }
      );
    }

    /* ---------------------------
       VALIDATE INPUT
    --------------------------- */
    const body = await req.json().catch(() => ({}));
    const filter = body?.filter ?? {};

    const periodDays: Record<string, number> = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "all": 3650,
    };

    const days = periodDays[filter.period] ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    /* ---------------------------
       FETCH SESSIONS
    --------------------------- */
    const { data: sessions, error: sessErr } = await db
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (sessErr) throw sessErr;

    /* ---------------------------
       FETCH SCORECARDS (FILTERED)
    --------------------------- */
    const { data: scorecards, error: scErr } = await db
      .from("scorecards")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString());

    if (scErr) throw scErr;

    /* ---------------------------
       FETCH PROFILE (SAFE)
    --------------------------- */
    const { data: profile, error: profileErr } = await db
      .from("profiles")
      .select("streak_days, longest_streak, total_sessions, total_practice_minutes, xp, level")
      .eq("id", user.id)
      .single();

    if (profileErr) throw profileErr;

    const sessionList = sessions ?? [];
    const scorecardList = scorecards ?? [];

    /* ---------------------------
       AGGREGATES
    --------------------------- */
    const totalSessions = sessionList.length;

    const totalMinutes =
      sessionList.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0) / 60;

    const scores = scorecardList
      .map((s) => s.overall_score)
      .filter((x): x is number => typeof x === "number");

    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

    /* ---------------------------
       RECENT SESSIONS (SAFE)
    --------------------------- */
    const recentSessions = sessionList.slice(0, 50).map((s) => {
      const sc = scorecardList.find((x) => x.session_id === s.id);

      return {
        session_id: s.id,
        date: s.created_at,
        mode: s.mode ?? "mock",
        interview_type: s.interview_type ?? "behavioral",
        company: s.company ?? null,
        overall_score: sc?.overall_score ?? 0,
        filler_rate: sc?.filler_rate ?? 0,
        wpm_avg: sc?.wpm_avg ?? 0,
        duration_minutes: Math.round((s.duration_seconds ?? 0) / 60),
        question_count: s.question_count ?? 0,
      };
    });

    /* ---------------------------
       CONFIDENCE TREND (FIXED)
    --------------------------- */
    const confidenceTrend = scorecardList
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((sc) => ({
        date: sc.created_at,
        score: sc.overall_score ?? 0,
      }));

    /* ---------------------------
       FINAL RESULT
    --------------------------- */
    const result = {
      total_sessions: profile?.total_sessions ?? totalSessions,
      total_practice_hours: Math.round((totalMinutes / 60) * 10) / 10,
      avg_confidence_score: avgScore,
      avg_confidence_delta_30d: null, // TODO: implement later

      current_streak: profile?.streak_days ?? 0,
      longest_streak: profile?.longest_streak ?? 0,

      avg_filler_rate:
        scorecardList.reduce((sum, sc) => sum + (sc.filler_rate ?? 0), 0) /
        (scorecardList.length || 1),

      avg_filler_delta_30d: null, // TODO

      avg_wpm:
        scorecardList.reduce((sum, sc) => sum + (sc.wpm_avg ?? 0), 0) /
        (scorecardList.length || 1),

      recent_sessions: recentSessions,
      confidence_trend: confidenceTrend,

      filler_trend: [], // TODO: implement from scorecards
      weak_spot_radar: [],
      leaderboard: [],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stats-dashboard error:", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
