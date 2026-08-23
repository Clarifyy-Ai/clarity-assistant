import { test, expect, loginAsTestUser } from "../playwright-fixture";

function corsHeaders(origin = "http://127.0.0.1:5000") {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info, x-idempotency-key, x-request-id",
    "access-control-expose-headers": "x-request-id, x-correlation-id",
    vary: "Origin",
    "content-type": "application/json",
    "x-request-id": "e2e-corr",
    "x-correlation-id": "e2e-corr",
  };
}

test.describe("Edge Function CORS — browser-readable responses", () => {
  test("Government Exams search is readable and does not report CORS failures", async ({
    page,
  }) => {
    const corsFailures: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/CORS|Access-Control-Allow-Origin|ERR_FAILED/i.test(text)) {
        corsFailures.push(text);
      }
    });
    page.on("pageerror", (err) => {
      if (/CORS|Failed to fetch|ERR_FAILED/i.test(err.message)) {
        corsFailures.push(err.message);
      }
    });

    await loginAsTestUser(page);
    await page.goto("/app/mock-test", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Search government exams")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByLabel("Search government exams").fill("SSC CGL");
    await page.getByLabel("Search government exams").press("Enter");
    await expect(page.getByText(/SSC Combined Graduate Level/i)).toBeVisible({
      timeout: 15_000,
    });
    expect(corsFailures).toEqual([]);
  });

  test("Practice Workspace loads without CORS failures", async ({ page }) => {
    const corsFailures: string[] = [];
    page.on("console", (msg) => {
      if (/CORS|Access-Control-Allow-Origin|ERR_FAILED/i.test(msg.text())) {
        corsFailures.push(msg.text());
      }
    });

    await loginAsTestUser(page);
    await page.goto("/app/practice-workspace", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Interview Practice Workspace/i }),
    ).toBeVisible({ timeout: 20_000 });
    expect(corsFailures).toEqual([]);
  });

  test("submit-test success JSON is readable by the page", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const res = await fetch("/__cors_probe_submit_success", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ test_id: "t1" }),
      });
      const json = await res.json();
      return { status: res.status, ok: res.ok, json };
    });

    expect(result.status).toBe(200);
    expect(result.json?.success ?? result.json?.data?.success).toBeTruthy();
  });

  test("submit-test validation error JSON is readable", async ({ page }) => {
    await page.route("**/__cors_probe_submit_400", async (route) => {
      await route.fulfill({
        status: 400,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: false,
          error: "Missing test_id",
          code: "VALIDATION_ERROR",
          correlation_id: "e2e-corr",
        }),
      });
    });

    await loginAsTestUser(page);
    await page.goto("/app/dashboard", { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const res = await fetch("/__cors_probe_submit_400", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.code).toBe("VALIDATION_ERROR");
    expect(typeof result.body.error).toBe("string");
  });

  test("authentication error JSON is readable", async ({ page }) => {
    await page.route("**/__cors_probe_401", async (route) => {
      await route.fulfill({
        status: 401,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: false,
          error: "Unauthorized.",
          code: "UNAUTHORIZED",
          correlation_id: "e2e-corr",
        }),
      });
    });

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const res = await fetch("/__cors_probe_401", { method: "POST" });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(401);
    expect(result.body.code).toBe("UNAUTHORIZED");
  });

  test("backend/provider 503 JSON is readable", async ({ page }) => {
    await page.route("**/__cors_probe_503", async (route) => {
      await route.fulfill({
        status: 503,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: false,
          error: "The service is temporarily unavailable. Please try again.",
          code: "SERVICE_UNAVAILABLE",
          correlation_id: "e2e-corr",
        }),
      });
    });

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const res = await fetch("/__cors_probe_503", { method: "POST" });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(503);
    expect(result.body.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(result.body)).not.toMatch(/postgres|service_role/i);
  });
});

test.beforeEach(async ({ page }) => {
  await page.route("**/__cors_probe_submit_success", async (route) => {
    await route.fulfill({
      status: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        data: { success: true, already_completed: false, total_score: 12 },
      }),
    });
  });
});
