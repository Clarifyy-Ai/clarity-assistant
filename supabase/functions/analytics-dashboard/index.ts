import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { filter } = await req.json();
    const db = createServiceClient();

    // Calculate date range
    const periodDays: Record<string, number> = {
      "7d": 7, "30d": 30, "90d": 90, "all": 3650,
    };
    const days = periodDays[filter?.period] ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Fetch sessions
    const { data: sessions } = await db
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    // Fetch scorecards
    const { data: scorecards } = await db
      .from("scorecards")
      .select("*")
      .eq("user_id", user.id);

    // Fetch profile for streak info
    const { data: profile } = await db
      .from("profiles")
      .select("streak_days, longest_streak, total_sessions, total_practice_minutes, xp, level")
      .eq("id", user.id)
      .single();

    const sessionList = sessions ?? [];
    const scorecardList = scorecards ?? [];

    // Compute aggregates
    const totalSessions = sessionList.length;
    const totalMinutes = sessionList.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0) / 60;

    const scores = scorecardList
      .map((s) => s.overall_score)
      .filter((s): s is number => s != null);
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    // Build recent sessions for chart
    const recentSessions = sessionList.slice(0, 50).map((s) => ({
      session_id:       s.id,
      date:             s.created_at,
      mode:             s.mode ?? "mock",
      interview_type:   s.interview_type ?? "behavioral",
      company:          s.company ?? null,
      overall_score:    scorecardList.find((sc) => sc.session_id === s.id)?.overall_score ?? 0,
      filler_rate:      0,
      wpm_avg:          0,
      duration_minutes: Math.round((s.duration_seconds ?? 0) / 60),
      question_count:   0,
    }));

    const result = {
      total_sessions:           profile?.total_sessions ?? totalSessions,
      total_practice_hours:     Math.round(totalMinutes / 60 * 10) / 10,
      avg_confidence_score:     avgScore,
      avg_confidence_delta_30d: null,
      current_streak:           profile?.streak_days ?? 0,
      longest_streak:           profile?.longest_streak ?? 0,
      avg_filler_rate:          0,
      avg_filler_delta_30d:     null,
      avg_wpm:                  0,
      recent_sessions:          recentSessions,
      confidence_trend:         scores.map((s, i) => ({ date: recentSessions[i]?.date ?? "", score: s })),
      filler_trend:             [],
      weak_spot_radar:          [],
      leaderboard:              [],
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
