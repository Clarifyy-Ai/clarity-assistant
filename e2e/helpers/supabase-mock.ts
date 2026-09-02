import type { Page, Route } from "@playwright/test";

/** Stable credentials for mocked auth flows (no real Supabase account required). */
export const E2E_TEST_USER = {
  id: "e2e-user-0001-0001-0001-000000000001",
  email: "e2e.test@example.com",
  password: "TestPass1!",
  fullName: "E2E Test User",
} as const;

export const E2E_USER_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
export const E2E_USER_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
export const E2E_COMPLETED_SESSION_ID = "11111111-2222-4333-8444-555555555555";
export const E2E_OWNER_DEBRIEF_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const E2E_VALID_SHARE_TOKEN = "e2e-valid-share-token";

export const E2E_SHARED_DEBRIEF = {
  id: "debrief-share-e2e-1",
  overall_grade: "B+",
  summary: "Strong opener with clear experience and relevant examples.",
  strengths: ["Clear structure", "Confident delivery"],
  improvements: ["Add more metrics", "Shorten closing answers"],
  created_at: "2026-08-30T10:25:00.000Z",
  detailed_report: {
    category_scores: { confidence: 81 },
  },
};

export const E2E_SHARED_SCORECARD = {
  id: "scorecard-share-e2e-1",
  user_id: E2E_TEST_USER.id,
  session_id: E2E_COMPLETED_SESSION_ID,
  overall_score: 81,
  strengths: ["Concise answers"],
  improvements: ["More STAR detail"],
  feedback: "Solid technical depth with room to tighten pacing.",
  created_at: "2026-08-30T10:20:00.000Z",
};

export type MockAuthOptions = {
  onboarded?: boolean;
  emailConfirmed?: boolean;
  /** When emailConfirmed is false, reject password login with email_not_confirmed (GoTrue 400). */
  rejectUnconfirmedLogin?: boolean;
  /** Emails that should trigger duplicate-registration errors on signup. */
  registeredEmails?: Set<string>;
  /** Plan on the mocked profile — Pro-gated pages need "pro" or above. */
  planId?: string;
  /** Spendable credit balance. Default 500. */
  credits?: number;
  /** Distinct user id for isolation fixtures (User A / User B). */
  userId?: string;
  /** Verified TOTP enrolled — login must challenge. */
  mfaEnrolled?: boolean;
  /** Owner of the completed session fixture. Defaults to the logged-in user. */
  sessionOwnerId?: string;
  /** When false (default), sync-calendar returns honest 501 NOT_CONFIGURED. */
  calendarConfigured?: boolean;
  /** Profile/subscription billing status for PAST_DUE fixtures. */
  subscriptionStatus?: "active" | "past_due" | "canceled" | "trialing";
  /** Grant admin role via user_roles for /app/admin e2e. */
  isAdmin?: boolean;
};

type ResumeRow = Record<string, unknown>;

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers":
        "authorization, apikey, content-type, x-client-info, x-idempotency-key, x-request-id, x-correlation-id",
      "access-control-expose-headers": "x-request-id, x-correlation-id",
      vary: "Origin",
      "x-request-id": "e2e-mock-request",
      "x-correlation-id": "e2e-mock-request",
    },
    body: JSON.stringify(body),
  });
}

function toBase64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function makeAccessToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    toBase64Url({ alg: "none", typ: "JWT" }),
    toBase64Url({
      iss: "https://qzgvjrvtkwlzxpmlddkx.supabase.co/auth/v1",
      aud: "authenticated",
      sub: userId,
      email: E2E_TEST_USER.email,
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "password", timestamp: now }],
      session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      exp: now + 3600,
      iat: now,
    }),
    "eAAA",
  ].join(".");
}

function makeUser(email: string, confirmed: boolean, id = E2E_TEST_USER.id) {
  const now = new Date().toISOString();
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: confirmed ? now : null,
    phone: "",
    confirmed_at: confirmed ? now : null,
    last_sign_in_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: E2E_TEST_USER.fullName },
    identities: [],
    factors: [],
    created_at: now,
    updated_at: now,
  };
}

function makeSession(user: ReturnType<typeof makeUser>) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: makeAccessToken(user.id),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "e2e-mock-refresh-token",
    user,
  };
}

function makeProfile(
  userId: string,
  email: string,
  onboardingCompleted: boolean,
  planId = "free",
  credits = 500,
  subscriptionStatus = "active",
) {
  const now = new Date().toISOString();
  return {
    id: userId,
    email,
    full_name: E2E_TEST_USER.fullName,
    plan_id: planId,
    credits,
    onboarding_completed: onboardingCompleted,
    onboarding_step: onboardingCompleted ? 2 : 1,
    target_role: onboardingCompleted ? "Software Engineer" : "",
    region: "IN",
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    created_at: now,
    updated_at: now,
    is_banned: false,
    subscription_status: subscriptionStatus,
    payment_failed_at:
      subscriptionStatus === "past_due"
        ? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
        : null,
  };
}

const EMPTY_ANALYTICS = {
  total_sessions: 3,
  avg_score: 76,
  avg_confidence_score: 76,
  avg_confidence_delta_30d: 4,
  avg_filler_rate: 0.8,
  avg_filler_delta_30d: -0.2,
  avg_wpm: 124,
  current_streak: 2,
  longest_streak: 5,
  total_practice_hours: 1.2,
  streak_days: 2,
  confidence_trend: [
    { date: "2026-08-20T10:00:00.000Z", score: 70 },
    { date: "2026-08-22T15:00:00.000Z", score: 82 },
  ],
  filler_trend: [],
  weak_spot_radar: [{ label: "mock", avg_score: 76, session_count: 2 }],
  recent_sessions: [
    {
      session_id: "11111111-1111-4111-8111-111111111111",
      date: "2026-08-20T10:00:00.000Z",
      started_at: "2026-08-20T10:00:00.000Z",
      ended_at: "2026-08-20T10:18:00.000Z",
      mode: "mock",
      title: "Mock — Acme",
      company: "Acme",
      overall_score: 70,
      score_status: "scored",
      completion_state: "completed",
      comparable: true,
      filler_rate: 1.2,
      wpm_avg: 118,
      duration_minutes: 18,
      question_count: 4,
      answered_count: 4,
    },
    {
      session_id: "22222222-2222-4222-8222-222222222222",
      date: "2026-08-22T15:00:00.000Z",
      started_at: "2026-08-22T15:00:00.000Z",
      ended_at: "2026-08-22T15:25:00.000Z",
      mode: "rehearsal",
      title: "Rehearsal — Globex",
      company: "Globex",
      overall_score: 82,
      score_status: "scored",
      completion_state: "completed",
      comparable: true,
      filler_rate: 0.4,
      wpm_avg: 130,
      duration_minutes: 25,
      question_count: 5,
      answered_count: 5,
    },
    {
      session_id: "e2e-unscored-1",
      date: new Date().toISOString(),
      mode: "mock",
      company: "Unscored Co",
      overall_score: null,
      score_status: "not_scored",
      completion_state: "incomplete",
      comparable: false,
    },
  ],
  category_scores: [],
  filler_stats: { total_fillers: 0, top_fillers: [] },
  wpm_trend: [],
  score_trend: [],
};

const COMPARE_PAYLOAD = {
  source_version: "compare-sessions.v1",
  baseline_rule: "older_session",
  timezone: "UTC",
  baseline: {
    session_id: "11111111-1111-4111-8111-111111111111",
    role: "baseline",
    title: "Mock — Acme",
    session_type: "mock",
    company: "Acme",
    status: "completed",
    completion_state: "completed",
    score_state: "scored",
    started_at: "2026-08-20T10:00:00.000Z",
    ended_at: "2026-08-20T10:18:00.000Z",
    created_at: "2026-08-20T10:00:00.000Z",
    display_datetime: "Aug 20, 2026, 10:00 AM",
    duration_seconds: 1080,
    duration_minutes: 18,
    question_count: 4,
    answered_count: 4,
    unanswered_count: 0,
    overall_score: 70,
    dimensions: { communication: 72, technical: 68, problem_solving: 71, confidence: 65 },
    speech: { filler_rate: 1.2, wpm_avg: 118 },
  },
  comparison: {
    session_id: "22222222-2222-4222-8222-222222222222",
    role: "comparison",
    title: "Rehearsal — Globex",
    session_type: "rehearsal",
    company: "Globex",
    status: "completed",
    completion_state: "completed",
    score_state: "scored",
    started_at: "2026-08-22T15:00:00.000Z",
    ended_at: "2026-08-22T15:25:00.000Z",
    created_at: "2026-08-22T15:00:00.000Z",
    display_datetime: "Aug 22, 2026, 3:00 PM",
    duration_seconds: 1500,
    duration_minutes: 25,
    question_count: 5,
    answered_count: 5,
    unanswered_count: 0,
    overall_score: 82,
    dimensions: { communication: 80, technical: 74, problem_solving: 78, confidence: 76 },
    speech: { filler_rate: 0.4, wpm_avg: 130 },
  },
  deltas: {
    overall_score: 12,
    communication: 8,
    technical: 6,
    problem_solving: 7,
    confidence: 11,
    filler_rate: -0.8,
    wpm_avg: 12,
    duration_seconds: 420,
    question_count: 1,
    answered_count: 1,
  },
  improvement_areas: ["Overall score", "Fewer filler words"],
  regression_areas: [],
};

/**
 * Intercept Supabase auth, REST, storage, and edge-function calls so E2E tests
 * run without a live project or test credentials.
 */
export async function setupSupabaseMocks(
  page: Page,
  options: MockAuthOptions = {}
): Promise<{ registeredEmails: Set<string>; resumes: ResumeRow[] }> {
  const registeredEmails =
    options.registeredEmails ?? new Set<string>([E2E_TEST_USER.email]);
  const resumes: ResumeRow[] = [];
  const practicePlans: Record<string, unknown>[] = [];
  const practicePlanItems: Record<string, unknown>[] = [];
  const onboarded = options.onboarded !== false;
  const emailConfirmed = options.emailConfirmed !== false;
  const rejectUnconfirmedLogin = options.rejectUnconfirmedLogin ?? !emailConfirmed;
  const planId = options.planId ?? "free";
  const credits = options.credits ?? 500;
  const userId = options.userId ?? E2E_TEST_USER.id;
  const sessionOwnerId = options.sessionOwnerId ?? userId;
  const mfaEnrolled = options.mfaEnrolled === true;
  const calendarConfigured = options.calendarConfigured === true;
  const subscriptionStatus = options.subscriptionStatus ?? "active";
  const isAdmin = options.isAdmin === true;
  let spendableCredits = credits;

  await page.route("**/*supabase.co/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
          "access-control-allow-headers": "*",
        },
        body: "",
      });
    }

    // ── Auth ──────────────────────────────────────────────────────────────
    if (url.includes("/auth/v1/signup") && method === "POST") {
      let email: string = E2E_TEST_USER.email;
      try {
        const body = route.request().postDataJSON() as { email?: string };
        email = (body.email ?? email).toLowerCase();
      } catch {
        // ignore malformed body in tests
      }

      if (registeredEmails.has(email)) {
        return fulfillJson(route, 422, {
          error: "user_already_exists",
          error_code: "user_already_exists",
          msg: "User already registered",
        });
      }

      registeredEmails.add(email);
      const user = makeUser(email, false);
      return fulfillJson(route, 200, { user, session: null });
    }

    if (url.includes("/auth/v1/token") && method === "POST") {
      const postData = route.request().postData() ?? "";
      let email = E2E_TEST_USER.email;
      let password = "";
      try {
        const json = JSON.parse(postData) as {
          email?: string;
          password?: string;
        };
        if (typeof json.email === "string") email = json.email;
        if (typeof json.password === "string") password = json.password;
      } catch {
        const emailMatch = postData.match(/username=([^&]+)/);
        if (emailMatch?.[1]) {
          email = decodeURIComponent(emailMatch[1]);
        }
        const passwordMatch = postData.match(/password=([^&]*)/);
        if (passwordMatch) {
          password = decodeURIComponent(passwordMatch[1] ?? "");
        }
      }
      email = email.toLowerCase();

      if (email === "nobody@example.com") {
        return fulfillJson(route, 400, {
          error: "invalid_grant",
          error_code: "otp_expired",
          msg: "Password recovery token is invalid",
          error_description: "password token invalid",
        });
      }

      if (email === "bad@example.com" || password === "wrong-password") {
        return fulfillJson(route, 401, {
          error: "invalid_grant",
          error_description: "Invalid login credentials",
        });
      }

      if (!emailConfirmed && rejectUnconfirmedLogin) {
        return fulfillJson(route, 400, {
          error: "invalid_grant",
          error_code: "email_not_confirmed",
          msg: "Email not confirmed",
          error_description: "Email not confirmed",
        });
      }

      const user = makeUser(email, emailConfirmed, userId);
      return fulfillJson(route, 200, makeSession(user));
    }

    if (url.includes("/auth/v1/user") && method === "GET") {
      const user = makeUser(E2E_TEST_USER.email, emailConfirmed, userId);
      return fulfillJson(route, 200, user);
    }

    if (url.includes("/auth/v1/logout") && method === "POST") {
      const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
      return route.fulfill({
        status: 204,
        body: "",
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-credentials": "true",
        },
      });
    }

    if (url.includes("/auth/v1/recover") && method === "POST") {
      return fulfillJson(route, 200, {});
    }

    if (url.includes("/auth/v1/aal")) {
      return fulfillJson(route, 200, {
        currentLevel: mfaEnrolled ? "aal1" : "aal1",
        nextLevel: mfaEnrolled ? "aal2" : "aal1",
      });
    }

    if (url.includes("/auth/v1/factors")) {
      if (mfaEnrolled) {
        return fulfillJson(route, 200, {
          totp: [
            {
              id: "e2e-totp-factor",
              factor_type: "totp",
              status: "verified",
              friendly_name: "Authenticator app",
            },
          ],
          phone: [],
          all: [
            {
              id: "e2e-totp-factor",
              factor_type: "totp",
              status: "verified",
              friendly_name: "Authenticator app",
            },
          ],
        });
      }
      return fulfillJson(route, 200, {
        currentLevel: "aal1",
        nextLevel: "aal1",
        totp: [],
        phone: [],
        all: [],
      });
    }

    // ── Profiles & roles ──────────────────────────────────────────────────
    if (url.includes("/rest/v1/profiles") && method === "GET") {
      const profile = makeProfile(
        userId,
        E2E_TEST_USER.email,
        onboarded,
        planId,
        credits,
        subscriptionStatus,
      );
      return fulfillJson(route, 200, [profile]);
    }

    if (url.includes("/rest/v1/profiles") && (method === "PATCH" || method === "POST")) {
      const profile = makeProfile(
        userId,
        E2E_TEST_USER.email,
        onboarded,
        planId,
        credits,
        subscriptionStatus,
      );
      return fulfillJson(route, 200, [profile]);
    }

    if (url.includes("/rest/v1/user_roles")) {
      if (isAdmin) {
        return fulfillJson(route, 200, [{ user_id: userId, role: "admin" }]);
      }
      return fulfillJson(route, 200, []);
    }

    // Admin bootstrap uses SECURITY DEFINER is_admin() — Free accounts are non-admin.
    if (url.includes("/rest/v1/rpc/is_admin")) {
      return fulfillJson(route, 200, isAdmin);
    }

    if (url.includes("/rest/v1/help_articles")) {
      if (method === "GET") {
        return fulfillJson(route, 200, []);
      }
      if (method === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        return fulfillJson(route, 201, {
          id: `help-${Date.now()}`,
          ...body,
          created_at: new Date().toISOString(),
        });
      }
      if (method === "PATCH") {
        return fulfillJson(route, 200, {});
      }
    }

    if (url.includes("/rest/v1/courses") && method === "GET") {
      return fulfillJson(route, 200, [
        {
          id: "course-e2e-1",
          title: "E2E Course",
          slug: "e2e-course",
          status: "draft",
          created_at: new Date().toISOString(),
        },
      ]);
    }

    if (url.includes("/rest/v1/course_modules") && method === "GET") {
      return fulfillJson(route, 200, []);
    }

    if (url.includes("/rest/v1/course_lessons") && method === "GET") {
      return fulfillJson(route, 200, []);
    }

    if (url.includes("/rest/v1/rpc/get_spendable_credits")) {
      return fulfillJson(route, 200, {
        success: true,
        balance: credits,
        plan_id: planId,
      });
    }

    if (url.includes("/rest/v1/rpc/complete_onboarding")) {
      return fulfillJson(route, 200, { success: true });
    }

    if (url.includes("/rest/v1/rpc/get_shared_debrief")) {
      let pToken = "";
      try {
        pToken = String(
          (route.request().postDataJSON() as { p_token?: string } | null)?.p_token ?? "",
        );
      } catch {
        pToken = "";
      }
      const row = pToken === E2E_VALID_SHARE_TOKEN ? E2E_SHARED_DEBRIEF : null;
      return fulfillJson(route, 200, row ? [row] : []);
    }

    if (url.includes("/rest/v1/rpc/get_shared_scorecard")) {
      let pToken = "";
      try {
        pToken = String(
          (route.request().postDataJSON() as { p_token?: string } | null)?.p_token ?? "",
        );
      } catch {
        pToken = "";
      }
      const row = pToken === E2E_VALID_SHARE_TOKEN ? E2E_SHARED_SCORECARD : null;
      return fulfillJson(route, 200, row ? [row] : []);
    }

    if (url.includes("/rest/v1/rpc/get_owned_session_detail")) {
      const body = (route.request().postDataJSON() as { p_session_id?: string } | null) ?? {};
      const requested = String(body.p_session_id ?? "");
      const owned = userId === sessionOwnerId && requested === E2E_COMPLETED_SESSION_ID;
      if (!owned) {
        return fulfillJson(route, 200, {
          found: false,
          code: "NOT_FOUND",
          session: null,
          answers: [],
          scorecard: null,
          transcript: null,
          debrief: null,
        });
      }
      return fulfillJson(route, 200, {
        found: true,
        code: "OK",
        session: {
          id: E2E_COMPLETED_SESSION_ID,
          user_id: sessionOwnerId,
          type: "mock",
          title: "Completed mock interview",
          overall_score: null,
          created_at: "2026-08-30T10:00:00.000Z",
          started_at: "2026-08-30T10:00:00.000Z",
          ended_at: "2026-08-30T10:18:00.000Z",
          duration_seconds: 1080,
          questions_asked: 3,
          status: "completed",
          lifecycle_status: "completed",
        },
        answers: [
          {
            id: "ans-1",
            session_id: E2E_COMPLETED_SESSION_ID,
            user_id: userId,
            question: "Tell me about yourself",
            answer: "I am a software engineer with eight years of experience.",
            score: 82,
            question_index: 0,
            created_at: "2026-08-30T10:05:00.000Z",
          },
        ],
        scorecard: { overall_score: 81 },
        transcript: { content: "I am a software engineer with eight years of experience." },
        debrief: { summary: "Strong opener with clear experience." },
      });
    }

    // ── Practice plan ─────────────────────────────────────────────────────
    if (url.includes("/rest/v1/interview_practice_plans") && method === "GET") {
      return fulfillJson(route, 200, practicePlans);
    }

    if (url.includes("/rest/v1/interview_practice_plans") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const row = {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...body,
      };
      practicePlans.unshift(row);
      return fulfillJson(route, 201, row);
    }

    if (url.includes("/rest/v1/interview_practice_plan_items") && method === "GET") {
      return fulfillJson(route, 200, practicePlanItems);
    }

    if (url.includes("/rest/v1/interview_practice_plan_items") && method === "POST") {
      const body = route.request().postDataJSON();
      const rows = (Array.isArray(body) ? body : [body]) as Record<string, unknown>[];
      const inserted = rows.map((row, index) => ({
        id: `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, "0")}`,
        completed: false,
        completed_at: null,
        created_at: new Date().toISOString(),
        ...row,
      }));
      practicePlanItems.push(...inserted);
      return fulfillJson(route, 201, inserted);
    }

    if (url.includes("/rest/v1/interview_practice_plan_items") && method === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const idMatch = url.match(/id=eq\.([0-9a-f-]+)/i);
      const id = idMatch?.[1];
      const idx = practicePlanItems.findIndex((row) => row.id === id);
      if (idx < 0) {
        return fulfillJson(route, 200, null);
      }
      practicePlanItems[idx] = { ...practicePlanItems[idx], ...body };
      return fulfillJson(route, 200, practicePlanItems[idx]);
    }

    // ── Documents ─────────────────────────────────────────────────────────
    if (url.includes("/rest/v1/resumes") && method === "GET") {
      return fulfillJson(route, 200, resumes);
    }

    if (url.includes("/rest/v1/resumes") && method === "POST") {
      const body = route.request().postDataJSON() as ResumeRow;
      const row: ResumeRow = {
        ...body,
        created_at: new Date().toISOString(),
      };
      resumes.push(row);
      return fulfillJson(route, 201, [row]);
    }

    if (url.includes("/rest/v1/job_descriptions") && method === "GET") {
      return fulfillJson(route, 200, [
        {
          id: "e2e-jd-1",
          user_id: E2E_TEST_USER.id,
          title: "Staff Engineer",
          target_role: "Staff Engineer",
          content: "Build APIs. TypeScript required.",
        },
      ]);
    }

    if (url.includes("/rest/v1/answer_bank") && method === "GET") {
      return fulfillJson(route, 200, []);
    }

    if (url.includes("/rest/v1/answer_bank") && (method === "POST" || method === "PATCH")) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const row = {
        id: "e2e-answer-1",
        user_id: E2E_TEST_USER.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_favourite: false,
        times_used: 0,
        last_used_at: null,
        deleted_at: null,
        tags: [],
        ...body,
      };
      return fulfillJson(route, 201, row);
    }

    if (url.includes("/rest/v1/system_design_topics") && method === "GET") {
      return fulfillJson(route, 200, [
        {
          slug: "url-shortener",
          title: "Design a URL Shortener",
          category: "Web",
          difficulty: "medium",
          description: "Design a service that shortens long URLs and redirects users.",
          key_concepts: ["Hashing", "Caching", "Database"],
          published: true,
          sort_order: 1,
        },
      ]);
    }

    if (url.includes("/rest/v1/practice_workspace_sessions")) {
      if (method === "GET") {
        const wantsActive = url.includes("status=eq.active") || url.includes("status%3Deq.active");
        if (wantsActive) {
          return fulfillJson(route, 200, []);
        }
        return fulfillJson(route, 200, []);
      }
      if (method === "POST") {
        const body = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
        return fulfillJson(route, 201, {
          id: "e2e-practice-draft-shared",
          version: 1,
          user_id: E2E_TEST_USER.id,
          status: "active",
          current_index: 0,
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          ...body,
        });
      }
      if (method === "PATCH" || method === "PUT") {
        const body = (route.request().postDataJSON() as Record<string, unknown>) ?? {};
        return fulfillJson(route, 200, {
          id: "e2e-practice-draft-shared",
          version: Number(body.version ?? 2),
          ...body,
        });
      }
    }

    // ── Storage ───────────────────────────────────────────────────────────
    if (url.includes("/storage/v1/object/") && method === "POST") {
      const objectPath = decodeURIComponent(
        url.split("/object/")[1]?.split("?")[0] ?? "resumes/mock.pdf"
      );
      return fulfillJson(route, 200, { Key: objectPath, Id: "mock-storage-id" });
    }

    if (url.includes("/storage/v1/object/sign/")) {
      return fulfillJson(route, 200, {
        signedURL: "/mock-signed-url/resume.pdf",
      });
    }

    // ── Edge functions ────────────────────────────────────────────────────
    if (url.includes("/functions/v1/search-exams")) {
      return fulfillJson(route, 200, {
        success: true,
        query: "",
        family: null,
        count: 1,
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasMore: false },
        results: [
          {
            resultType: "official_exam",
            examId: "e2e-exam-1",
            code: "SSC_CGL",
            name: "SSC Combined Graduate Level",
            family: "ssc",
            description: "Mock exam for e2e",
            legacyExamType: null,
            recruitingBody: { id: "ssc", code: "SSC", name: "SSC", officialUrl: null },
            aliases: ["SSC CGL"],
            stages: [{ id: "tier1", code: "tier1", name: "Tier 1", sort_order: 1 }],
            primaryActions: ["view_exam", "generate_mock", "start_preparation"],
            bankReadiness: {
              approvedPublicCount: 0,
              publicCount: 0,
              requiredQuestions: 0,
              status: "empty",
              fullSimulationAvailable: false,
            },
          },
        ],
        disclaimer: "Career Pilot is an independent preparation platform.",
      });
    }

    if (url.includes("/functions/v1/export-user-data")) {
      return fulfillJson(route, 200, {
        exported_at: new Date().toISOString(),
        user_id: E2E_TEST_USER.id,
        sessions: [],
        type: "sessions",
      });
    }

    if (url.includes("/functions/v1/submit-test")) {
      return fulfillJson(route, 200, {
        success: true,
        data: {
          success: true,
          already_completed: false,
          total_score: 0,
          analysis: null,
        },
      });
    }

    if (url.includes("/functions/v1/parse-resume")) {
      return fulfillJson(route, 200, { ok: true });
    }

    if (url.includes("/functions/v1/analytics-dashboard")) {
      return fulfillJson(route, 200, EMPTY_ANALYTICS);
    }

    if (url.includes("/functions/v1/start-session")) {
      let body: { action?: string; check_only?: boolean } = {};
      try {
        body = route.request().postDataJSON() as typeof body;
      } catch {
        body = {};
      }
      if (body.action === "eligibility" || body.check_only) {
        return fulfillJson(route, 200, {
          allowed: true,
          reason: "ALLOWED",
          used: 1,
          limit: 3,
          reset_at: new Date(Date.now() + 86400000).toISOString(),
        });
      }
      if (body.action === "restore" || body.action === "heartbeat") {
        return fulfillJson(route, 200, {
          found: true,
          reason: "ACTIVE",
          session_id: "11111111-1111-4111-8111-111111111111",
          status: "active",
          lifecycle_status: "IN_PROGRESS",
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          reused: true,
        });
      }
      return fulfillJson(route, 200, {
        session_id: "11111111-1111-4111-8111-111111111111",
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        reused: false,
        status: "active",
        lifecycle_status: "IN_PROGRESS",
        config: { duration_minutes: 5, question_count: 5 },
      });
    }

    if (url.includes("/functions/v1/end-session")) {
      return fulfillJson(route, 200, {
        session_id: "11111111-1111-4111-8111-111111111111",
        status: "completed",
        lifecycle_status: "COMPLETED",
        terminal_reason: "USER_ENDED",
        ended_at: new Date().toISOString(),
        duration_seconds: 12,
        already_terminal: false,
      });
    }

    if (url.includes("/functions/v1/compare-sessions")) {
      let body: { session_a_id?: string; session_b_id?: string } = {};
      try {
        body = route.request().postDataJSON() as typeof body;
      } catch {
        body = {};
      }
      const ids = [body.session_a_id, body.session_b_id];
      if (ids.includes("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")) {
        return fulfillJson(route, 404, {
          error: "One of those sessions could not be found.",
          code: "SESSION_NOT_FOUND",
        });
      }
      if (ids.includes("e2e-unscored-1")) {
        return fulfillJson(route, 422, {
          error: "Both sessions must be completed before they can be compared.",
          code: "SESSION_NOT_COMPLETED",
        });
      }
      if (new Set(ids).size < 2) {
        return fulfillJson(route, 422, {
          error: "Choose two different sessions.",
          code: "DUPLICATE_SESSION",
        });
      }
      return fulfillJson(route, 200, COMPARE_PAYLOAD);
    }

    if (url.includes("/functions/v1/deepgram-token")) {
      return fulfillJson(route, 200, { token: "e2e-fake-deepgram-token", expires_in: 60 });
    }

    if (url.includes("/functions/v1/prep-tool")) {
      let toolId = "";
      try {
        const body = route.request().postDataJSON() as { tool_id?: string };
        toolId = body.tool_id ?? "";
      } catch {
        // ignore
      }
      const toolCost = toolId === "system_design" ? 8 : toolId === "star_method" ? 10 : 3;
      if (spendableCredits < toolCost) {
        return fulfillJson(route, 402, {
          error: "You have no credits remaining. Upgrade to continue practicing.",
          code: "INSUFFICIENT_CREDITS",
        });
      }
      spendableCredits -= toolCost;
      if (toolId === "system_design") {
        return fulfillJson(route, 200, {
          success: true,
          data: {
            result: `## 1. Requirements
Functional URL shortening and redirect with analytics.

## 2. High-level architecture
Clients hit API gateway, write service stores mappings, read path uses cache.

## 3. Data model
urls(id, code, long_url, created_at) with unique code index.

## 4. Scaling
Partition by code hash, CDN for static assets, Redis for hot codes.

## 5. Tradeoffs
Consistency of click counts vs write throughput; eventual analytics.
`,
          },
          meta: { creditsCharged: 8 },
        });
      }
      if (toolId === "star_method") {
        return fulfillJson(route, 200, {
          success: true,
          data: {
            result: `Situation: At Acme I owned checkout reliability.
Task: Reduce failed payments during peak traffic.
Action: I added retries and monitoring for the payment gateway.
Result: Checkout failures dropped using the metrics already in my draft.`,
          },
          meta: { creditsCharged: 10 },
        });
      }
      return fulfillJson(route, 200, {
        success: true,
        data: { result: "Mock prep-tool result." },
        meta: { creditsCharged: 3 },
      });
    }

    if (url.includes("/functions/v1/polish-star-section")) {
      return fulfillJson(route, 200, {
        success: true,
        data: { polished: "Polished section text without invented metrics.", original: "" },
        meta: { creditsCharged: 2 },
      });
    }

    if (url.includes("/functions/v1/generate-star-answer")) {
      return fulfillJson(route, 200, {
        success: true,
        data: {
          situation: "From draft",
          task: "From draft",
          action: "From draft",
          result: "From draft",
          fullAnswer: "Situation: From draft. Task: From draft. Action: From draft. Result: From draft.",
        },
        meta: { creditsCharged: 10 },
      });
    }

    if (url.includes("/rest/v1/sessions")) {
      const sessionRow = {
        id: E2E_COMPLETED_SESSION_ID,
        user_id: sessionOwnerId,
        type: "mock",
        title: "Completed mock interview",
        overall_score: null,
        created_at: "2026-08-30T10:00:00.000Z",
        started_at: "2026-08-30T10:00:00.000Z",
        ended_at: "2026-08-30T10:18:00.000Z",
        duration_seconds: 1080,
        questions_asked: 3,
        status: "completed",
        lifecycle_status: "completed",
        tags: [],
        credits_used: 15,
        source_type: "mock",
      };
      const accept = route.request().headers()["accept"] ?? "";
      const wantObject = accept.includes("object");
      const asksForCompleted = url.includes(E2E_COMPLETED_SESSION_ID);
      const owned = userId === sessionOwnerId;
      if (method === "GET") {
        if (asksForCompleted) {
          if (!owned) return fulfillJson(route, 200, wantObject ? null : []);
          return fulfillJson(route, 200, wantObject ? sessionRow : [sessionRow]);
        }
        return fulfillJson(route, 200, owned ? [sessionRow] : []);
      }
      return fulfillJson(route, 200, wantObject ? sessionRow : [sessionRow]);
    }

    if (url.includes("/rest/v1/session_answers")) {
      if (userId !== sessionOwnerId) return fulfillJson(route, 200, []);
      const answers = [
        {
          id: "ans-1",
          session_id: E2E_COMPLETED_SESSION_ID,
          user_id: userId,
          question: "Tell me about yourself",
          answer: "I am a software engineer with eight years of experience.",
          score: 82,
          question_index: 0,
          created_at: "2026-08-30T10:05:00.000Z",
        },
      ];
      return fulfillJson(route, 200, answers);
    }

    if (url.includes("/rest/v1/scorecards")) {
      if (userId !== sessionOwnerId) {
        const accept = route.request().headers()["accept"] ?? "";
        return fulfillJson(route, 200, accept.includes("object") ? null : []);
      }
      const card = {
        id: "score-1",
        session_id: E2E_COMPLETED_SESSION_ID,
        user_id: userId,
        overall_score: 81,
        details: {},
        created_at: "2026-08-30T10:20:00.000Z",
      };
      const accept = route.request().headers()["accept"] ?? "";
      return fulfillJson(route, 200, accept.includes("object") ? card : [card]);
    }

    if (url.includes("/rest/v1/session_debriefs")) {
      const accept = route.request().headers()["accept"] ?? "";
      const wantObject = accept.includes("object");
      const asksForOwnedDebrief = url.includes(E2E_OWNER_DEBRIEF_ID);
      const owned = userId === sessionOwnerId;
      if (method === "GET") {
        if (asksForOwnedDebrief) {
          if (!owned) return fulfillJson(route, 200, wantObject ? null : []);
          return fulfillJson(route, 200, wantObject ? {
            id: E2E_OWNER_DEBRIEF_ID,
            user_id: sessionOwnerId,
            session_id: E2E_COMPLETED_SESSION_ID,
            overall_grade: "B+",
            priority_focus: "Structure",
            detailed_report: { summary: "Strong opener with clear experience." },
            created_at: "2026-08-30T10:25:00.000Z",
          } : []);
        }
        return fulfillJson(route, 200, owned ? [{
          id: E2E_OWNER_DEBRIEF_ID,
          user_id: sessionOwnerId,
          session_id: E2E_COMPLETED_SESSION_ID,
          overall_grade: "B+",
          priority_focus: "Structure",
          created_at: "2026-08-30T10:25:00.000Z",
        }] : []);
      }
      return fulfillJson(route, 200, wantObject ? null : []);
    }

    if (url.includes("/rest/v1/session_transcripts")) {
      if (userId !== sessionOwnerId) return fulfillJson(route, 200, []);
      return fulfillJson(route, 200, [{
        content: "I am a software engineer with eight years of experience.",
        offset_ms: 0,
        speaker: "candidate",
      }]);
    }

    if (url.includes("/rest/v1/subscriptions")) {
      if (subscriptionStatus === "past_due") {
        return fulfillJson(route, 200, [
          {
            id: "sub-e2e-past-due",
            user_id: userId,
            status: "past_due",
            plan_id: planId,
            payment_failed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ]);
      }
      return fulfillJson(route, 200, []);
    }

    if (url.includes("/functions/v1/generate-questions")) {
      const cost = 12;
      if (spendableCredits < cost) {
        return fulfillJson(route, 402, {
          error: "You have no credits remaining. Upgrade to continue practicing.",
          code: "INSUFFICIENT_CREDITS",
        });
      }
      spendableCredits -= cost;
      return fulfillJson(route, 200, {
        success: true,
        questions: [{ id: "q1", question: "Tell me about a hard problem you solved." }],
        meta: { creditsCharged: cost },
      });
    }

    if (url.includes("/functions/v1/billing-catalog")) {
      return fulfillJson(route, 200, {
        source: "billing_settings",
        paise: {
          pro_monthly: 249_900,
          enterprise_monthly: 679_900,
          credits_50: 69_900,
          credits_150: 189_900,
          credits_500: 599_900,
        },
      });
    }

    if (url.includes("/functions/v1/contact-sales")) {
      return fulfillJson(route, 200, { success: true });
    }

    if (url.includes("/functions/v1/schedule-interview")) {
      return fulfillJson(route, 200, {
        success: true,
        email_configured: false,
        reminders_queued: 2,
      });
    }

    if (url.includes("/functions/v1/disconnect-calendar")) {
      if (method === "GET") {
        return fulfillJson(route, 200, {
          connected: !!calendarConfigured,
          status: calendarConfigured ? "connected" : "disconnected",
          reauth_required: false,
          configured: !!calendarConfigured,
        });
      }
      return fulfillJson(route, 200, {
        success: true,
        connected: false,
        status: "disconnected",
        unlinked: false,
        preserved_google_login: true,
      });
    }

    if (url.includes("/functions/v1/sync-calendar")) {
      if (!calendarConfigured) {
        return fulfillJson(route, 501, {
          error: "Calendar sync is not available yet.",
          code: "NOT_CONFIGURED",
          message: "Google Calendar is not configured on this deployment.",
        });
      }
      let action = "";
      try {
        action = String((route.request().postDataJSON() as { action?: string }).action ?? "");
      } catch {
        // ignore
      }
      if (action === "oauth_start") {
        return fulfillJson(route, 200, {
          authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?e2e=1",
          already_connected: false,
        });
      }
      if (action === "oauth_callback") {
        return fulfillJson(route, 200, { connected: true, already_connected: false, status: "connected" });
      }
      if (action === "write_event") {
        return fulfillJson(route, 200, { event_id: "gcal-e2e-1", written: true });
      }
      if (action === "delete_event") {
        return fulfillJson(route, 200, { deleted: true });
      }
      return fulfillJson(route, 200, { imported: 0, available: true, configured: true });
    }

    if (url.includes("/functions/v1/delete-account")) {
      if (method === "OPTIONS") {
        return fulfillJson(route, 200, {});
      }
      return fulfillJson(route, 200, {
        success: true,
        status: "completed",
        operationId: "e2e-delete-op",
      });
    }

    if (url.includes("/functions/v1/")) {
      return fulfillJson(route, 200, { ok: true });
    }

    if (url.includes("/rest/v1/")) {
      return fulfillJson(route, 200, method === "GET" ? [] : null);
    }

    return route.continue();
  });

  return { registeredEmails, resumes };
}
