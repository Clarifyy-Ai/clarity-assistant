import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;

    const user = auth.context.user;
    const db = createServiceClient();
    const jsonHeaders = { ...getCorsHeaders(req), "Content-Type": "application/json" };

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
    const { data: profile } = await db
      .from("profiles")
      .select("streak_days, longest_streak, total_sessions, total_practice_minutes, xp, level")
      .eq("id", user.id)
      .maybeSingle();

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

    const mid = new Date();
    mid.setDate(mid.getDate() - Math.min(days, 30));
    const recentSc = scorecardList.filter((sc) => new Date(sc.created_at) >= mid);
    const olderSc = scorecardList.filter((sc) => new Date(sc.created_at) < mid);

    const avgOf = (list: typeof scorecardList, field: "overall_score" | "filler_rate" | "wpm_avg") => {
      const vals = list.map((s) => s[field]).filter((x): x is number => typeof x === "number");
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    const recentScoreAvg = avgOf(recentSc, "overall_score");
    const olderScoreAvg = avgOf(olderSc, "overall_score");
    const scoreDelta30d =
      recentScoreAvg !== null && olderScoreAvg !== null
        ? Math.round(recentScoreAvg - olderScoreAvg)
        : null;

    const recentFillerAvg = avgOf(recentSc, "filler_rate");
    const olderFillerAvg = avgOf(olderSc, "filler_rate");
    const fillerDelta30d =
      recentFillerAvg !== null && olderFillerAvg !== null
        ? Math.round((recentFillerAvg - olderFillerAvg) * 100) / 100
        : null;

    const fillerTrend = scorecardList
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-30)
      .map((sc) => ({
        date: sc.created_at,
        total_fillers: Math.round((sc.filler_rate ?? 0) * 10),
        top_filler: sc.top_filler_word ?? null,
      }));

    const byType = new Map<string, { sum: number; count: number; sessions: number }>();
    for (const sc of scorecardList) {
      const session = sessionList.find((s) => s.id === sc.session_id);
      const label = session?.interview_type ?? "behavioral";
      const cur = byType.get(label) ?? { sum: 0, count: 0, sessions: 0 };
      cur.sum += sc.overall_score ?? 0;
      cur.count += 1;
      cur.sessions += 1;
      byType.set(label, cur);
    }
    const weakSpotRadar = [...byType.entries()].map(([label, v]) => ({
      label,
      avg_score: v.count ? Math.round(v.sum / v.count) : 0,
      session_count: v.sessions,
    }));

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
      avg_confidence_delta_30d: scoreDelta30d,

      current_streak: profile?.streak_days ?? 0,
      longest_streak: profile?.longest_streak ?? 0,

      avg_filler_rate:
        scorecardList.reduce((sum, sc) => sum + (sc.filler_rate ?? 0), 0) /
        (scorecardList.length || 1),

      avg_filler_delta_30d: fillerDelta30d,

      avg_wpm:
        scorecardList.reduce((sum, sc) => sum + (sc.wpm_avg ?? 0), 0) /
        (scorecardList.length || 1),

      recent_sessions: recentSessions,
      confidence_trend: confidenceTrend,

      filler_trend: fillerTrend,
      weak_spot_radar: weakSpotRadar,
      leaderboard: [],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analytics-dashboard error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
