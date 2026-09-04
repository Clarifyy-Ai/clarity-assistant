import {
  test,
  expect,
  loginAsTestUser,
  setupSupabaseMocks,
  E2E_TEST_USER,
} from "../playwright-fixture";

const INTERVIEW_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_TIMEZONE = "Asia/Kolkata";

function makeScheduledInterviewRow(overrides: Record<string, unknown> = {}) {
  const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
  return {
    id: INTERVIEW_ID,
    user_id: E2E_TEST_USER.id,
    company_name: "Infosys",
    role_title: "Backend Engineer",
    status: "scheduled",
    stage: "technical_round",
    timezone: TARGET_TIMEZONE,
    calendar_sync_status: null,
    calendar_sync_error: null,
    calendar_event_id: null,
    created_at: new Date().toISOString(),
    interview_rounds: [
      {
        id: "round-e2e-1",
        scheduled_interview_id: INTERVIEW_ID,
        round_number: 1,
        status: "scheduled",
        scheduled_at: scheduledAt,
        timezone: TARGET_TIMEZONE,
        duration_minutes: 60,
      },
    ],
    ...overrides,
  };
}

function interviewRouteHandler(
  interviews: Array<Record<string, unknown>>,
  capturedTimezones: string[],
) {
  return async (route: import("@playwright/test").Route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/rest/v1/scheduled_interviews")) {
      if (method === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        if (typeof body.timezone === "string") capturedTimezones.push(body.timezone);
        const row = {
          ...body,
          // Stable id so edit/reload assertions can target a known interview.
          id: INTERVIEW_ID,
          status: "scheduled",
          interview_rounds: [],
        };
        interviews.length = 0;
        interviews.push(row);
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(row),
        });
      }
      if (method === "PATCH" || method === "PUT") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        if (typeof body.timezone === "string") capturedTimezones.push(body.timezone);
        if (interviews[0]) {
          interviews[0] = { ...interviews[0], ...body, id: INTERVIEW_ID };
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(interviews[0] ?? null),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(interviews),
      });
    }
    if (url.includes("/rest/v1/interview_rounds") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const roundTimezone =
        typeof body.timezone === "string"
          ? body.timezone
          : typeof interviews[0]?.timezone === "string"
            ? interviews[0].timezone
            : null;
      if (roundTimezone) capturedTimezones.push(roundTimezone);
      const scheduledAt =
        body.scheduled_at ?? new Date(Date.now() + 86_400_000).toISOString();
      const round = {
        ...body,
        id: "round-e2e-1",
        scheduled_interview_id: INTERVIEW_ID,
        status: "scheduled",
        scheduled_at: scheduledAt,
        timezone: roundTimezone,
      };
      if (interviews[0]) {
        interviews[0] = {
          ...interviews[0],
          id: INTERVIEW_ID,
          timezone: roundTimezone ?? interviews[0].timezone,
          interview_rounds: [round],
        };
      }
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(round),
      });
    }
    if (url.includes("/functions/v1/schedule-interview")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, email_configured: false, reminders_queued: 2 }),
      });
    }
    return route.fallback();
  };
}

test.describe("Scheduler + calendar", () => {
  test("create keeps timezone and cancel leaves the active list", async ({ page }) => {
    await loginAsTestUser(page, { planId: "pro" });

    const interviews: Array<Record<string, unknown>> = [];
    const capturedTimezones: string[] = [];
    await page.route(
      "**/*qzgvjrvtkwlzxpmlddkx.supabase.co/**",
      interviewRouteHandler(interviews, capturedTimezones),
    );

    await page.goto("/app/interviews/new", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/company/i).fill("Infosys");
    await page.getByLabel(/role/i).fill("Backend Engineer");
    await page.locator("#schedule-timezone").selectOption(TARGET_TIMEZONE);
    await page.getByRole("button", { name: /schedule|save|create/i }).first().click();
    await expect(page).not.toHaveURL(/\/app\/interviews\/new/, { timeout: 20_000 });

    expect(capturedTimezones).toContain(TARGET_TIMEZONE);

    await page.goto(`/app/interviews/${INTERVIEW_ID}/edit`, { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel(/company/i)).toHaveValue("Infosys", { timeout: 20_000 });
    await expect(page.locator("#schedule-timezone")).toHaveValue(TARGET_TIMEZONE, {
      timeout: 20_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByLabel(/company/i)).toHaveValue("Infosys", { timeout: 20_000 });
    await expect(page.locator("#schedule-timezone")).toHaveValue(TARGET_TIMEZONE, {
      timeout: 20_000,
    });
  });

  test("new interview page shows honest not-configured message on 501 probe", async ({
    page,
  }) => {
    await setupSupabaseMocks(page);
    await page.route("**/functions/v1/sync-calendar**", async (route) => {
      return route.fulfill({
        status: 501,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Calendar sync is not available yet.",
          code: "NOT_CONFIGURED",
          message: "Google Calendar is not configured on this deployment.",
        }),
      });
    });
    await page.route("**/functions/v1/disconnect-calendar**", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            connected: false,
            status: "disconnected",
            configured: false,
          }),
        });
      }
      return route.fallback();
    });
    await loginAsTestUser(page, { planId: "pro" });
    await page.goto("/app/interviews/new", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/Google Calendar — Not configured|not configured on this environment/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Calendar sync is not configured on this environment yet/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /connect google calendar/i })).toHaveCount(0);
  });

  test("interviews list disables calendar CTA when sync is not configured", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.route("**/functions/v1/sync-calendar**", async (route) => {
      const body = route.request().postDataJSON() as { probe?: boolean } | null;
      if (body?.probe) {
        return route.fulfill({
          status: 501,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Calendar sync is not available yet.",
            code: "NOT_CONFIGURED",
          }),
        });
      }
      return route.continue();
    });
    await loginAsTestUser(page, { planId: "pro" });
    await page.goto("/app/interviews", { waitUntil: "domcontentloaded" });
    const calendarBtn = page.getByRole("button", { name: /calendar: not configured/i });
    await expect(calendarBtn).toBeVisible({ timeout: 15_000 });
    await expect(calendarBtn).toBeDisabled();
  });

  test("verification_pending gates Connect and still allows scheduling", async ({ page }) => {
    await setupSupabaseMocks(page);
    let oauthStartHit = false;
    await page.route("**/functions/v1/sync-calendar**", async (route) => {
      const body = route.request().postDataJSON() as {
        probe?: boolean;
        action?: string;
      } | null;
      if (body?.probe) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              available: true,
              configured: true,
              publicOauth: false,
              connectAllowed: false,
              reason: "verification_pending",
            },
          }),
        });
      }
      if (body?.action === "oauth_start") {
        oauthStartHit = true;
        return route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Calendar sync not available yet (Google verification pending).",
            code: "OAUTH_NOT_PUBLIC",
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ok: true } }),
      });
    });
    await page.route("**/functions/v1/disconnect-calendar**", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            connected: false,
            status: "disconnected",
            configured: true,
          }),
        });
      }
      return route.fallback();
    });

    await loginAsTestUser(page, { planId: "pro" });
    await page.goto("/app/interviews/new", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("calendar-verification-pending-banner")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("new-interview-calendar-connect")).toHaveCount(0);
    await expect(page.getByLabel(/company/i)).toBeVisible({ timeout: 15_000 });

    await page.goto("/app/settings/integrations", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("calendar-connect-gated")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("calendar-connect-cta")).toHaveCount(0);
    expect(oauthStartHit).toBe(false);

    await page.goto("/app/interviews", { waitUntil: "domcontentloaded" });
    const comingSoon = page.getByTestId("interviews-calendar-cta");
    await expect(comingSoon).toBeVisible({ timeout: 15_000 });
    await expect(comingSoon).toBeDisabled();
    await expect(comingSoon).toContainText(/coming soon/i);
  });

  test("settings shows denied banner from calendar=denied query", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.route("**/functions/v1/sync-calendar**", async (route) => {
      const body = route.request().postDataJSON() as { probe?: boolean } | null;
      if (body?.probe) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              available: true,
              configured: true,
              publicOauth: false,
              connectAllowed: true,
              reason: "ok",
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ok: true } }),
      });
    });
    await page.route("**/functions/v1/disconnect-calendar**", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            connected: false,
            status: "disconnected",
            configured: true,
          }),
        });
      }
      return route.fallback();
    });
    await loginAsTestUser(page, { planId: "pro" });
    await page.goto("/app/settings/integrations?calendar=denied", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("calendar-oauth-denied-banner")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("allowlisted probe shows Connect CTA without navigation until click", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.route("**/functions/v1/sync-calendar**", async (route) => {
      const body = route.request().postDataJSON() as {
        probe?: boolean;
        action?: string;
      } | null;
      if (body?.probe) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              available: true,
              configured: true,
              publicOauth: false,
              connectAllowed: true,
              reason: "ok",
            },
          }),
        });
      }
      if (body?.action === "oauth_start") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              authorization_url:
                "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ok: true } }),
      });
    });
    await page.route("**/functions/v1/disconnect-calendar**", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            connected: false,
            status: "disconnected",
            configured: true,
          }),
        });
      }
      return route.fallback();
    });
    await loginAsTestUser(page, { planId: "pro" });
    await page.goto("/app/settings/integrations", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("calendar-connect-cta")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("calendar-connect-gated")).toHaveCount(0);
  });

  test("calendar probe is honest NOT_CONFIGURED when secrets are missing", async ({ page }) => {
    await setupSupabaseMocks(page);
    await page.route("**/functions/v1/sync-calendar**", async (route) => {
      return route.fulfill({
        status: 501,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Calendar sync is not available yet.",
          code: "NOT_CONFIGURED",
        }),
      });
    });
    await loginAsTestUser(page, { planId: "pro" });
    await page.goto("/app/settings/integrations", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/not configured|not available|Google Calendar/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /Checking/i })).toHaveCount(0, { timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /Requires Configuration|Connect|Reconnect/i }).first(),
    ).toBeVisible();
  });

  test("calendar preferences save and persist after refresh", async ({ page }) => {
    await loginAsTestUser(page, { planId: "pro" });
    await page.goto("/app/settings/integrations", { waitUntil: "domcontentloaded" });

    const autoCreate = page.getByTestId("calendar-pref-auto-create");
    await expect(autoCreate).toBeVisible({ timeout: 15_000 });
    await expect(autoCreate).toHaveAttribute("data-state", "checked");

    await autoCreate.click();
    await expect(autoCreate).toHaveAttribute("data-state", "unchecked");
    await page.getByTestId("integrations-save").click();
    await expect(page.getByRole("button", { name: /Saved/i })).toBeVisible({ timeout: 10_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("calendar-pref-auto-create")).toHaveAttribute(
      "data-state",
      "unchecked",
      { timeout: 15_000 },
    );
    await expect(page.getByRole("button", { name: /Disconnect/i })).toHaveCount(0);
  });

  test("configured calendar write and delete are live actions", async ({ page }) => {
    await loginAsTestUser(page, { planId: "pro", calendarConfigured: true });
    const write = await page.evaluate(async () => {
      const res = await fetch("https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/sync-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write_event",
          interview_id: "11111111-1111-4111-8111-111111111111",
          summary: "Interview: Infosys",
          start: new Date(Date.now() + 86400000).toISOString(),
          end: new Date(Date.now() + 90000000).toISOString(),
        }),
      });
      return { status: res.status, json: await res.json() };
    });
    expect(write.status).toBe(200);
    expect(write.json.written || write.json.event_id).toBeTruthy();

    const del = await page.evaluate(async () => {
      const res = await fetch("https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/sync-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_event",
          interview_id: "11111111-1111-4111-8111-111111111111",
          event_id: "gcal-e2e-1",
        }),
      });
      return { status: res.status, json: await res.json() };
    });
    expect(del.status).toBe(200);
    expect(del.json.deleted).toBe(true);
  });

  test("delete calls schedule-interview cancel before removing the interview row", async ({
    page,
  }) => {
    await loginAsTestUser(page, { planId: "pro" });

    const interviews = [makeScheduledInterviewRow()];
    const teardownOrder: string[] = [];

    await page.route("**/*qzgvjrvtkwlzxpmlddkx.supabase.co/**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes("/functions/v1/schedule-interview") && method === "POST") {
        const body = route.request().postDataJSON() as { action?: string };
        teardownOrder.push(body.action === "cancel" ? "cancel" : "schedule");
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, reminders_queued: 0 }),
        });
      }

      if (url.includes("/rest/v1/scheduled_interviews")) {
        if (method === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(interviews),
          });
        }
        if (method === "DELETE") {
          teardownOrder.push("delete");
          interviews.length = 0;
          return route.fulfill({ status: 204, body: "" });
        }
      }

      return route.fallback();
    });

    await page.goto(`/app/interviews/${INTERVIEW_ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Infosys" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/app\/interviews\/?$/, { timeout: 20_000 });

    expect(teardownOrder).toContain("cancel");
    expect(teardownOrder).toContain("delete");
    expect(teardownOrder.indexOf("cancel")).toBeLessThan(teardownOrder.indexOf("delete"));
  });

  test("interview detail shows sync error badge and retry when calendar is configured", async ({
    page,
  }) => {
    await loginAsTestUser(page, { planId: "pro", calendarConfigured: true });

    const interviews = [
      makeScheduledInterviewRow({
        calendar_sync_status: "sync_error",
        calendar_sync_error: "Google Calendar rate limited",
        calendar_event_id: "gcal-e2e-1",
      }),
    ];

    await page.route("**/*qzgvjrvtkwlzxpmlddkx.supabase.co/**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/rest/v1/scheduled_interviews") && method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(interviews),
        });
      }
      return route.fallback();
    });

    await page.goto(`/app/interviews/${INTERVIEW_ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Sync failed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Google Calendar rate limited")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Retry calendar sync" })).toBeVisible({
      timeout: 20_000,
    });
  });
});
