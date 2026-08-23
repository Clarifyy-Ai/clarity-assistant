import { test, expect, loginAsTestUser } from "../playwright-fixture";

const EXAM_ID = "11111111-1111-4111-8111-111111111111";
const STAGE_ID = "22222222-2222-4222-8222-222222222222";

test.describe("Government exam generation and submission UX", () => {
  test.describe.configure({ timeout: 120_000 });
  test("shows inventory shortage and custom practice option instead of a 100-question generate", async ({
    page,
  }) => {
    await loginAsTestUser(page);

    await page.route("**/functions/v1/search-exams", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          results: [
            {
              resultType: "official_exam",
              examId: EXAM_ID,
              code: "SSC_CGL",
              name: "SSC CGL",
              family: "ssc",
              description: null,
              legacyExamType: "SSC Exams (CGL/CHSL)",
              recruitingBody: { id: "b1", code: "SSC", name: "SSC", officialUrl: null },
              aliases: [],
              stages: [{ id: STAGE_ID, code: "t1", name: "Tier 1", sort_order: 1 }],
              stage: { id: STAGE_ID, code: "t1", name: "Tier 1", sort_order: 1 },
              pattern: {
                version: "2024",
                totalQuestions: 100,
                totalMarks: 200,
                durationMinutes: 60,
                negativeMark: 0.5,
                sourceUrl: null,
              },
              languages: ["en"],
              lastVerified: "2024-01-01",
              bankReadiness: {
                approvedPublicCount: 23,
                publicCount: 23,
                requiredQuestions: 100,
                status: "partial",
                fullSimulationAvailable: false,
              },
              primaryActions: [],
            },
          ],
          disclaimer: "practice",
          count: 1,
        }),
      });
    });

    let generateCalls = 0;
    await page.route("**/functions/v1/create-exam-paper", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        return;
      }
      generateCalls += 1;
      const body = route.request().postDataJSON() as { questionCount?: number; mode?: string };
      if ((body.questionCount ?? 100) > 23 || body.mode === "generated_mock") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({
            error: "Only 23 approved questions are available for this configuration.",
            code: "QUESTION_INVENTORY_INSUFFICIENT",
            available: 23,
            requested: 100,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          jobId: "job-1",
          status: "completed",
          mockTestId: "test-1",
          questionCount: body.questionCount ?? 23,
          paperClass: "custom_practice",
        }),
      });
    });

    await page.goto(
      `/app/mock-test/generate?examId=${EXAM_ID}&stageId=${STAGE_ID}&basis=full_sim`,
    );
    await expect(page.getByRole("heading", { name: /Generate practice paper/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/23 \/ 100 questions available|23\/100 approved/i)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByText(/Only 23 approved questions are currently available/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Generate Custom Practice Set — up to 23/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate Full Paper" })).toHaveCount(0);
    expect(generateCalls).toBe(0);
  });

  test("submit-test CORS preflight and duplicate submit stay readable", async ({ page }) => {
    let submitCount = 0;
    await page.route("**/functions/v1/submit-test", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "http://127.0.0.1:5000",
            "access-control-allow-headers": "authorization, content-type, apikey, idempotency-key",
            "access-control-allow-methods": "POST, OPTIONS",
          },
        });
        return;
      }
      submitCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "http://127.0.0.1:5000" },
        body: JSON.stringify({
          success: true,
          already_completed: submitCount > 1,
          analysis: { total_score: 12 },
        }),
      });
    });

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const res1 = await page.evaluate(async () => {
      const r = await fetch("https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/submit-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ test_id: "t1", idempotencyKey: "submit:t1" }),
      });
      return { ok: r.ok, json: await r.json() };
    });
    const res2 = await page.evaluate(async () => {
      const r = await fetch("https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/submit-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ test_id: "t1", idempotencyKey: "submit:t1" }),
      });
      return { ok: r.ok, json: await r.json() };
    });

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(res2.json.already_completed).toBe(true);
    expect(submitCount).toBe(2);
  });
});
