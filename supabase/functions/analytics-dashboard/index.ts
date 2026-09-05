import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
} from "../_shared/rateLimit.ts";
import { isFeatureKilled, killSwitchResponse } from "../_shared/featureKillSwitch.ts";
import { analyticsScoreStatusFromEvaluation } from "../_shared/scorecardEligibility.ts";

function localDayKey(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;

    const user = auth.context.user;

    // Server-side kill-switch: analytics must not work when flag is disabled.
    if (await isFeatureKilled("analytics")) {
      return killSwitchResponse(req);
    }

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
    const timeZone =
      typeof body?.timezone === "string" && body.timezone.length > 0
        ? body.timezone
        : "UTC";

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
    if (filter.period !== "all") {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(since);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const localDate = new Date(
        Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) - days),
      );
      const localDateUtc = localDate.getTime();
      const offsetParts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(localDateUtc));
      const offsetValues = Object.fromEntries(
        offsetParts.map((part) => [part.type, part.value]),
      );
      const representedUtc = Date.UTC(
        Number(offsetValues.year),
        Number(offsetValues.month) - 1,
        Number(offsetValues.day),
        Number(offsetValues.hour),
        Number(offsetValues.minute),
        Number(offsetValues.second),
      );
      since.setTime(localDateUtc - (representedUtc - localDateUtc));
    }

    /* ---------------------------
       FETCH SESSIONS
    --------------------------- */
    let sessionsQuery = db
      .from("sessions")
      .select(
        "id,user_id,title,type,status,lifecycle_status,deleted_at,started_at,ended_at,created_at,questions_asked,answers_generated,avg_wpm,filler_words,tags",
      )
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    let { data: sessions, error: sessErr } = await sessionsQuery.or(
      "status.eq.completed,lifecycle_status.eq.COMPLETED,lifecycle_status.eq.ANALYZED",
    );

    if (sessErr && /lifecycle_status|column.*does not exist/i.test(String(sessErr.message ?? ""))) {
      console.warn(
        "[analytics-dashboard] lifecycle_status filter unavailable, falling back to status=completed",
        sessErr.message,
      );
      ({ data: sessions, error: sessErr } = await db
        .from("sessions")
        .select(
          "id,user_id,title,type,status,deleted_at,started_at,ended_at,created_at,questions_asked,answers_generated,avg_wpm,filler_words,tags",
        )
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .eq("status", "completed")
        .order("created_at", { ascending: false }));
    }

    if (filter.period !== "all") {
      const sinceIso = since.toISOString();
      sessions = (sessions ?? []).filter((s) => {
        const anchor = s.started_at ?? s.created_at;
        return anchor && anchor >= sinceIso;
      });
    }

    if (sessErr) throw sessErr;

    const sessionListRaw = (sessions ?? []).filter((s) => {
      if (Array.isArray(s.tags) && s.tags.includes("private")) return false;
      if (!filter.session_filter || filter.session_filter === "all") {
        if (filter.interview_type && filter.interview_type !== "all") {
          const tagMatch = Array.isArray(s.tags) &&
            s.tags.some((t) => String(t).toLowerCase() === String(filter.interview_type).toLowerCase());
          if (!tagMatch) return false;
        }
        return true;
      }
      const type = String(s.type ?? "").toLowerCase();
      const modeMatch = filter.session_filter === "real_interview"
        ? type === "real_interview"
        : type === filter.session_filter;
      if (!modeMatch) return false;
      if (filter.interview_type && filter.interview_type !== "all") {
        const tagMatch = Array.isArray(s.tags) &&
          s.tags.some((t) => String(t).toLowerCase() === String(filter.interview_type).toLowerCase());
        if (!tagMatch) return false;
      }
      return true;
    });

    // Deduplicate by session id (defensive against duplicate query rows).
    const seenSessionIds = new Set<string>();
    const sessionList = sessionListRaw.filter((s) => {
      const id = String(s.id ?? "");
      if (!id || seenSessionIds.has(id)) return false;
      seenSessionIds.add(id);
      return true;
    });

    /* ---------------------------
       FETCH SCORECARDS (FILTERED)
    --------------------------- */
    const { data: scorecards, error: scErr } = sessionList.length
      ? await db
        .from("scorecards")
        .select("*")
        .eq("user_id", user.id)
        .in("session_id", sessionList.map((s) => s.id))
      : { data: [], error: null };

    if (scErr) throw scErr;

    const sessionIds = sessionList.map((s: { id: string }) => s.id);
    const { data: answerRows } = sessionIds.length
      ? await db
        .from("session_answers")
        .select("session_id,answer")
        .eq("user_id", user.id)
        .in("session_id", sessionIds)
      : { data: [] as { session_id: string; answer: string | null }[] };

    /* ---------------------------
       FETCH PROFILE (SAFE)
    --------------------------- */
    const { data: profile } = await db
      .from("profiles")
      .select("streak_days, longest_streak, total_sessions, total_practice_minutes, xp, level")
      .eq("id", user.id)
      .maybeSingle();

    const scorecardListRaw = scorecards ?? [];
    const seenScorecardSessions = new Set<string>();
    const scorecardList = scorecardListRaw.filter((sc) => {
      const sid = String(sc.session_id ?? "");
      if (!sid || seenScorecardSessions.has(sid)) return false;
      seenScorecardSessions.add(sid);
      return true;
    });
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

    const sessionDurationSeconds = (
      session: { started_at?: string | null; ended_at?: string | null },
    ): number | null => {
      if (!session.started_at || !session.ended_at) return null;
      const start = Date.parse(session.started_at);
      const end = Date.parse(session.ended_at);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      const seconds = Math.round((end - start) / 1000);
      return seconds >= 0 ? seconds : null;
    };

    const sessionFillerRatePerMinute = (session: {
      filler_words?: number | null;
      started_at?: string | null;
      ended_at?: string | null;
    }): number | null => {
      const fillers = session.filler_words;
      const duration = sessionDurationSeconds(session);
      if (typeof fillers !== "number" || !Number.isFinite(fillers) || fillers < 0) {
        return null;
      }
      if (duration == null || duration <= 0) return null;
      const minutes = duration / 60;
      if (minutes <= 0) return null;
      return Math.round((fillers / minutes) * 100) / 100;
    };

    const resolveWpm = (
      sc: Record<string, unknown> | undefined,
      session: { avg_wpm?: number | null },
    ): number | null => {
      const fromCard = sc ? scorecardMetric(sc, "wpm_avg") : null;
      if (typeof fromCard === "number") return fromCard;
      return typeof session.avg_wpm === "number" ? session.avg_wpm : null;
    };

    const resolveFillerRate = (
      sc: Record<string, unknown> | undefined,
      session: {
        filler_words?: number | null;
        started_at?: string | null;
        ended_at?: string | null;
      },
    ): number | null => {
      const fromCard = sc ? scorecardMetric(sc, "filler_rate") : null;
      if (typeof fromCard === "number") return fromCard;
      return sessionFillerRatePerMinute(session);
    };

    const averageFinite = (vals: Array<number | null>): number | null => {
      const nums = vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (nums.length === 0) return null;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    };

    const companyFromTitle = (title: string | null | undefined): string | null => {
      if (!title) return null;
      const parts = title.split(/\s+[—–-]\s+/);
      if (parts.length < 2) return null;
      const company = parts.slice(1).join(" — ").trim();
      return company.length > 0 ? company : null;
    };

    const totalMinutes =
      sessionList.reduce((sum, s) => {
        const duration = sessionDurationSeconds(s);
        return duration === null ? sum : sum + duration;
      }, 0) / 60;

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

    const recentWpmAvg = averageFinite(
      sessionList
        .filter((s) => new Date(String(s.started_at ?? s.created_at)) >= mid)
        .map((s) => resolveWpm(scorecardList.find((x) => x.session_id === s.id), s)),
    );
    const olderWpmAvg = averageFinite(
      sessionList
        .filter((s) => new Date(String(s.started_at ?? s.created_at)) < mid)
        .map((s) => resolveWpm(scorecardList.find((x) => x.session_id === s.id), s)),
    );
    const wpmDelta30d =
      recentWpmAvg !== null && olderWpmAvg !== null
        ? Math.round(recentWpmAvg - olderWpmAvg)
        : null;

    const recentFillerAvg = averageFinite(
      sessionList
        .filter((s) => new Date(String(s.started_at ?? s.created_at)) >= mid)
        .map((s) => resolveFillerRate(scorecardList.find((x) => x.session_id === s.id), s)),
    );
    const olderFillerAvg = averageFinite(
      sessionList
        .filter((s) => new Date(String(s.started_at ?? s.created_at)) < mid)
        .map((s) => resolveFillerRate(scorecardList.find((x) => x.session_id === s.id), s)),
    );
    const fillerDelta30d =
      recentFillerAvg !== null && olderFillerAvg !== null
        ? Math.round((recentFillerAvg - olderFillerAvg) * 100) / 100
        : null;

    const avgDimension = (
      field: "communication" | "technical" | "problem_solving" | "confidence",
    ) => {
      const vals = scorecardList
        .map((sc) => sc[field])
        .filter((x): x is number => typeof x === "number");
      return vals.length
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        : null;
    };

    const dimension_averages = {
      communication: avgDimension("communication"),
      technical: avgDimension("technical"),
      problem_solving: avgDimension("problem_solving"),
      confidence: avgDimension("confidence"),
    };

    const fillerTrend = scorecardList
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-30)
      .map((sc) => {
        const rate = scorecardMetric(sc, "filler_rate");
        const top = scorecardMetric(sc, "top_filler_word");
        return {
          date: sc.created_at,
          filler_rate: typeof rate === "number" ? rate : null,
          // Do not invent absolute counts from rate (* 10 was fake).
          total_fillers: null as number | null,
          top_filler: typeof top === "string" ? top : null,
        };
      });

    const byType = new Map<string, { sum: number; count: number; sessions: number }>();
    for (const sc of scorecardList) {
      if (typeof sc.overall_score !== "number") continue;
      const session = sessionList.find((s) => s.id === sc.session_id);
      const label = session?.type ?? "session";
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

    const answersBySession = new Map<string, { total: number; answered: number }>();
    for (const row of answerRows ?? []) {
      const sid = String((row as { session_id?: string }).session_id ?? "");
      if (!sid) continue;
      const cur = answersBySession.get(sid) ?? { total: 0, answered: 0 };
      cur.total += 1;
      const answer = (row as { answer?: string | null }).answer;
      if (typeof answer === "string" && answer.trim().length > 0) cur.answered += 1;
      answersBySession.set(sid, cur);
    }

    const recentSessions = sessionList.map((s) => {
      const sc = scorecardList.find((x) => x.session_id === s.id);
      const hasScore = typeof sc?.overall_score === "number";
      const status = String(s.status ?? "").toLowerCase();
      const life = String(s.lifecycle_status ?? "").toUpperCase();
      const completion_state =
        status === "abandoned" ? "invalid" :
        status === "completed" || life === "COMPLETED" || life === "ANALYZED" ? "completed" :
        "incomplete";
      const duration = sessionDurationSeconds(s);
      const answerStats = answersBySession.get(s.id);
      const question_count = answerStats
        ? answerStats.total
        : (typeof s.questions_asked === "number" ? s.questions_asked : null);
      const answered_count = answerStats
        ? answerStats.answered
        : (typeof s.answers_generated === "number" ? s.answers_generated : null);

      const score_status = analyticsScoreStatusFromEvaluation({
        evaluationStatus: sc
          ? String((sc as { evaluation_status?: string | null }).evaluation_status ?? "")
          : null,
        overallScore: hasScore ? (sc!.overall_score as number) : null,
        answeredCount: answered_count,
      });

      return {
        session_id: s.id,
        date: s.started_at ?? s.created_at,
        started_at: s.started_at ?? null,
        ended_at: s.ended_at ?? null,
        title: s.title ?? null,
        mode: s.type ?? "mock",
        interview_type: (() => {
          const tags = Array.isArray(s.tags) ? s.tags : [];
          const hit = tags.find((t) =>
            /^(behavioural|behavioral|technical|system_design|case|general)$/i.test(String(t))
          );
          return hit ? String(hit).toLowerCase() : null;
        })(),
        company: companyFromTitle(s.title),
        status,
        completion_state,
        overall_score: score_status === "scored" && hasScore ? sc!.overall_score : null,
        // pending | failed | excluded | not_scored | scored (from durable evaluation_status when present)
        score_status,
        comparable: completion_state === "completed" && score_status === "scored",
        filler_rate: (() => {
          const rate = resolveFillerRate(sc, s);
          return rate;
        })(),
        wpm_avg: resolveWpm(sc, s),
        duration_seconds: duration,
        duration_minutes: duration === null ? null : Math.round(duration / 60),
        question_count,
        answered_count,
        unanswered_count:
          typeof question_count === "number" && typeof answered_count === "number"
            ? Math.max(0, question_count - answered_count)
            : null,
      };
    });

    const confidenceTrend = scorecardList
      .filter((sc) => typeof sc.overall_score === "number")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((sc) => ({
        date: sc.created_at,
        score: sc.overall_score as number,
      }));

    const sessionsScored = recentSessions.filter(
      (s) => typeof s.overall_score === "number",
    ).length;

    const activityByDay: Record<string, number> = {};
    for (const session of recentSessions) {
      const anchor = session.started_at ?? session.date;
      if (!anchor) continue;
      const day = localDayKey(String(anchor), timeZone);
      if (!day) continue;
      activityByDay[day] = (activityByDay[day] ?? 0) + 1;
    }
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
        // Use filtered+deduped list length so private/filter exclusions match KPIs.
        total: totalSessions,
        total_pages: Math.max(1, Math.ceil(totalSessions / perPage)),
      },
      // This metric powers the selected-period KPI. The profile counter is a
      // lifetime value and must not override the filtered query count.
      total_sessions: totalSessions,
      total_practice_hours: Math.round((totalMinutes / 60) * 10) / 10,
      avg_confidence_score: avgScore,
      avg_confidence_delta_30d: scoreDelta30d,

      current_streak: typeof profile?.streak_days === "number" ? profile.streak_days : null,
      longest_streak: typeof profile?.longest_streak === "number" ? profile.longest_streak : null,

      avg_filler_rate: (() => {
        const avg = averageFinite(
          sessionList.map((s) => resolveFillerRate(scorecardList.find((x) => x.session_id === s.id), s)),
        );
        return avg == null ? null : Math.round(avg * 100) / 100;
      })(),

      avg_filler_delta_30d: fillerDelta30d,

      avg_wpm: (() => {
        const avg = averageFinite(
          sessionList.map((s) => resolveWpm(scorecardList.find((x) => x.session_id === s.id), s)),
        );
        return avg == null ? null : Math.round(avg);
      })(),

      avg_wpm_delta_30d: wpmDelta30d,

      recent_sessions: recentSessions,
      confidence_trend: confidenceTrend,
      sessions_scored: sessionsScored,
      activity_by_day: activityByDay,

      filler_trend: fillerTrend,
      weak_spot_radar: weakSpotRadar,
      dimension_averages,
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
