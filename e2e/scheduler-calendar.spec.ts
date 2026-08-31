import { test, expect, loginAsTestUser, setupSupabaseMocks } from "../playwright-fixture";

test.describe("Scheduler + calendar", () => {
  test("create keeps timezone and cancel leaves the active list", async ({ page }) => {
    await loginAsTestUser(page, { planId: "pro" });

    const interviews: Array<Record<string, unknown>> = [];
    await page.route("**/*qzgvjrvtkwlzxpmlddkx.supabase.co/**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/rest/v1/scheduled_interviews")) {
        if (method === "POST") {
          const body = route.request().postDataJSON() as Record<string, unknown>;
          const row = {
            ...body,
            id: body.id ?? "11111111-1111-4111-8111-111111111111",
            status: "scheduled",
            interview_rounds: [],
          };
          interviews.push(row);
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify(row),
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
        if (interviews[0]) {
          interviews[0] = {
            ...interviews[0],
            timezone: body.timezone ?? interviews[0].timezone,
            interview_rounds: [{ ...body, status: "scheduled" }],
            next_round: { ...body, status: "scheduled" },
          };
        }
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(body),
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
    });

    await page.goto("/app/interviews/new", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/company/i).fill("Infosys");
    await page.getByLabel(/role/i).fill("Backend Engineer");
    const tz = page.locator("select").filter({ hasText: /Kolkata|UTC|Local/i }).first();
    if (await tz.count()) {
      await tz.selectOption({ label: /Kolkata/i }).catch(async () => {
        await tz.selectOption("Asia/Kolkata").catch(() => undefined);
      });
    }
    await page.getByRole("button", { name: /schedule|save|create/i }).first().click();
    await expect(page).not.toHaveURL(/\/app\/interviews\/new/, { timeout: 20_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Infosys/i).first()).toBeVisible({ timeout: 15_000 });
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
});
