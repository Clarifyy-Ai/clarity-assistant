import type { Page, Route } from "@playwright/test";

/** Stable credentials for mocked auth flows (no real Supabase account required). */
export const E2E_TEST_USER = {
  id: "e2e-user-0001-0001-0001-000000000001",
  email: "e2e.test@example.com",
  password: "TestPass1!",
  fullName: "E2E Test User",
} as const;

export type MockAuthOptions = {
  onboarded?: boolean;
  emailConfirmed?: boolean;
  /** Emails that should trigger duplicate-registration errors on signup. */
  registeredEmails?: Set<string>;
};

type ResumeRow = Record<string, unknown>;

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(body),
  });
}

function makeUser(email: string, confirmed: boolean) {
  const now = new Date().toISOString();
  return {
    id: E2E_TEST_USER.id,
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
    created_at: now,
    updated_at: now,
  };
}

function makeSession(user: ReturnType<typeof makeUser>) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: "e2e-mock-access-token",
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
  onboardingCompleted: boolean
) {
  const now = new Date().toISOString();
  return {
    id: userId,
    email,
    full_name: E2E_TEST_USER.fullName,
    plan_id: "free",
    credits: 10,
    onboarding_completed: onboardingCompleted,
    target_role: "Software Engineer",
    created_at: now,
    updated_at: now,
    is_banned: false,
  };
}

const EMPTY_ANALYTICS = {
  total_sessions: 0,
  avg_score: 0,
  streak_days: 0,
  recent_sessions: [],
  category_scores: [],
  filler_stats: { total_fillers: 0, top_fillers: [] },
  wpm_trend: [],
  score_trend: [],
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
  const onboarded = options.onboarded !== false;
  const emailConfirmed = options.emailConfirmed !== false;

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
      let email = E2E_TEST_USER.email;
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
      const emailMatch = postData.match(/username=([^&]+)/);
      const email = decodeURIComponent(
        emailMatch?.[1] ?? E2E_TEST_USER.email
      ).toLowerCase();

      if (email === "bad@example.com" || postData.includes("wrong-password")) {
        return fulfillJson(route, 400, {
          error: "invalid_grant",
          error_description: "Invalid login credentials",
        });
      }

      const user = makeUser(email, emailConfirmed);
      return fulfillJson(route, 200, makeSession(user));
    }

    if (url.includes("/auth/v1/user") && method === "GET") {
      const user = makeUser(E2E_TEST_USER.email, emailConfirmed);
      return fulfillJson(route, 200, user);
    }

    if (url.includes("/auth/v1/logout") && method === "POST") {
      return route.fulfill({ status: 204, body: "" });
    }

    // ── Profiles & roles ──────────────────────────────────────────────────
    if (url.includes("/rest/v1/profiles") && method === "GET") {
      const profile = makeProfile(
        E2E_TEST_USER.id,
        E2E_TEST_USER.email,
        onboarded
      );
      return fulfillJson(route, 200, [profile]);
    }

    if (url.includes("/rest/v1/profiles") && (method === "PATCH" || method === "POST")) {
      const profile = makeProfile(
        E2E_TEST_USER.id,
        E2E_TEST_USER.email,
        onboarded
      );
      return fulfillJson(route, 200, [profile]);
    }

    if (url.includes("/rest/v1/user_roles")) {
      return fulfillJson(route, 200, []);
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
      return fulfillJson(route, 200, []);
    }

    if (url.includes("/rest/v1/answer_bank") && method === "GET") {
      return fulfillJson(route, 200, []);
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
    if (url.includes("/functions/v1/parse-resume")) {
      return fulfillJson(route, 200, { ok: true });
    }

    if (url.includes("/functions/v1/analytics-dashboard")) {
      return fulfillJson(route, 200, EMPTY_ANALYTICS);
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
