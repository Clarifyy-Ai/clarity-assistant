import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
} from "../_shared/rateLimit.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;

    const user = auth.context.user;

    // Controlled degradation: RPC outage must not blank Analytics with 503.
    const rateLimitResult = await checkRateLimitAsync(createServiceClient(), {
      key: createRateLimitKey("analytics-dashboard", user.id),
      limit: 10,
      windowMs: 60_000,
    });
    if (!rateLimitResult.allowed && !rateLimitResult.backendFailure) {
      return rateLimitResponse(rateLimitResult);
    }

    const db = createServiceClient();
    const jsonHeaders = { ...getCorsHeaders(req), "Content-Type": "application/json" };

    /* ---------------------------
       VALIDATE INPUT
    --------------------------- */
    const body = await req.json().catch(() => ({}));
    const filter = body?.filter ?? {};

    const rawPage = Number(body?.page);
    const rawPerPage = Number(body?.per_page);
    const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
    const perPage = Number.isInteger(rawPerPage) && rawPerPage >= 1
      ? Math.min(rawPerPage, 100)
      : 50;

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
    const offset = (page - 1) * perPage;

    const { data: sessions, error: sessErr, count: totalCount } = await db
      .from("sessions")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString())
      .not("tags", "cs", "{private}")
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

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
    const scorecardMetric = (
      scorecard: Record<string, unknown>,
      key: "filler_rate" | "wpm_avg" | "top_filler_word",
    ): number | string | null => {
      const direct = scorecard[key];
      if (typeof direct === "number" || typeof direct === "string") return direct;
      const details = scorecard.details;
      if (details && typeof details === "object") {
        const nested = (details as Record<string, unknown>)[key]
          ?? (key === "top_filler_word"
            ? (details as Record<string, unknown>).top_filler_words
            : undefined);
        if (typeof nested === "number" || typeof nested === "string") return nested;
      }
      return null;
    };

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
        : null;

    const mid = new Date();
    mid.setDate(mid.getDate() - Math.min(days, 30));
    const recentSc = scorecardList.filter((sc) => new Date(sc.created_at) >= mid);
    const olderSc = scorecardList.filter((sc) => new Date(sc.created_at) < mid);

    const avgOf = (list: typeof scorecardList, field: "overall_score" | "filler_rate" | "wpm_avg") => {
      const vals = list
        .map((s) => field === "overall_score" ? s[field] : scorecardMetric(s, field))
        .filter((x): x is number => typeof x === "number");
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
        total_fillers: typeof scorecardMetric(sc, "filler_rate") === "number"
          ? Math.round(scorecardMetric(sc, "filler_rate") as number * 10)
          : null,
        top_filler: scorecardMetric(sc, "top_filler_word"),
      }));

    const byType = new Map<string, { sum: number; count: number; sessions: number }>();
    for (const sc of scorecardList) {
      if (typeof sc.overall_score !== "number") continue;
      const session = sessionList.find((s) => s.id === sc.session_id);
      const label = session?.interview_type ?? "behavioral";
      const cur = byType.get(label) ?? { sum: 0, count: 0, sessions: 0 };
      cur.sum += sc.overall_score;
      cur.count += 1;
      cur.sessions += 1;
      byType.set(label, cur);
    }
    const weakSpotRadar = [...byType.entries()].map(([label, v]) => ({
      label,
      avg_score: v.count ? Math.round(v.sum / v.count) : null,
      session_count: v.sessions,
    }));

    const recentSessions = sessionList.slice(0, 50).map((s) => {
      const sc = scorecardList.find((x) => x.session_id === s.id);
      const hasScore = typeof sc?.overall_score === "number";
      const incomplete =
        (s.status === "incomplete" || s.status === "abandoned") ||
        (!hasScore && (s.question_count ?? 0) === 0);

      return {
        session_id: s.id,
        date: s.created_at,
        mode: s.mode ?? "mock",
        interview_type: s.interview_type ?? "behavioral",
        company: s.company ?? null,
        overall_score: hasScore ? sc!.overall_score : null,
        score_status: incomplete ? "not_scored" : hasScore ? "scored" : "not_scored",
        filler_rate: sc && typeof scorecardMetric(sc, "filler_rate") === "number"
          ? scorecardMetric(sc, "filler_rate") as number
          : null,
        wpm_avg: sc && typeof scorecardMetric(sc, "wpm_avg") === "number"
          ? scorecardMetric(sc, "wpm_avg") as number
          : null,
        duration_minutes: Math.round((s.duration_seconds ?? 0) / 60),
        question_count: s.question_count ?? 0,
      };
    });

    const confidenceTrend = scorecardList
      .filter((sc) => typeof sc.overall_score === "number")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((sc) => ({
        date: sc.created_at,
        score: sc.overall_score as number,
      }));
    /* ---------------------------
       CREDIT RECONCILIATION CHECK
    --------------------------- */
    try {
      const { data: creditProfile } = await db
        .from("profiles")
        .select("credits")
        .eq("id", user.id)
        .maybeSingle();

      const { data: txnAgg } = await db
        .from("credit_transactions")
        .select("amount")
        .eq("user_id", user.id);

      if (creditProfile && txnAgg) {
        const txnSum = (txnAgg as { amount: number }[]).reduce(
          (sum, row) => sum + (row.amount ?? 0),
          0,
        );
        const drift = Math.abs((creditProfile.credits ?? 0) - txnSum);

        if (drift > 10) {
          console.warn(
            `[analytics-dashboard] Credit drift detected for user ${user.id}: profile=${creditProfile.credits}, txn_sum=${txnSum}, drift=${drift}`,
          );
          await db.from("audit_logs").insert({
            user_id: user.id,
            action: "credit_drift_warning",
            details: {
              profile_credits: creditProfile.credits,
              transaction_sum: txnSum,
              drift,
            },
          });
        }
      }
    } catch (reconcileErr) {
      console.error("[analytics-dashboard] Credit reconciliation failed (non-fatal):", reconcileErr);
    }

    /* ---------------------------
       FINAL RESULT
    --------------------------- */
    const result = {
      pagination: {
        page,
        per_page: perPage,
        total: totalCount ?? totalSessions,
        total_pages: Math.ceil((totalCount ?? totalSessions) / perPage),
      },
      // This metric powers the selected-period KPI. The profile counter is a
      // lifetime value and must not override the filtered query count.
      total_sessions: totalCount ?? totalSessions,
      total_practice_hours: Math.round((totalMinutes / 60) * 10) / 10,
      avg_confidence_score: avgScore,
      avg_confidence_delta_30d: scoreDelta30d,

      current_streak: profile?.streak_days ?? 0,
      longest_streak: profile?.longest_streak ?? 0,

      avg_filler_rate:
        scorecardList.reduce((sum, sc) => sum + (typeof scorecardMetric(sc, "filler_rate") === "number"
          ? scorecardMetric(sc, "filler_rate") as number
          : 0), 0) /
        (scorecardList.length || 1),

      avg_filler_delta_30d: fillerDelta30d,

      avg_wpm:
        scorecardList.reduce((sum, sc) => sum + (typeof scorecardMetric(sc, "wpm_avg") === "number"
          ? scorecardMetric(sc, "wpm_avg") as number
          : 0), 0) /
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
    return new Response(JSON.stringify({ error: "Internal server error", code: "INTERNAL_ERROR" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
