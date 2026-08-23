import { test, expect, loginAsTestUser } from "../playwright-fixture";

test.describe("Knowledge Base / Answer Bank WS16", () => {
  test("loads empty state without console page errors", async ({ page }) => {
    await loginAsTestUser(page);

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/app/answers", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Answer Bank", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Your Answer Bank is empty.").first()).toBeVisible({
      timeout: 10_000,
    });
    expect(pageErrors.filter((m) => !/ResizeObserver|Script error/i.test(m))).toEqual([]);
  });

  test("shows retry-friendly error without raw PostgREST text", async ({ page }) => {
    await loginAsTestUser(page);

    await page.route("**/rest/v1/answer_bank**", async (route) => {
      if (route.request().method() === "GET") {
        const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
          },
          body: JSON.stringify({
            message: 'column answer_bank.session_id does not exist',
            code: "42703",
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/app/answers", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/couldn't load/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/session_id/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /retry/i }).first()).toBeVisible();
  });

  test("search empty-results state works after load", async ({ page }) => {
    await loginAsTestUser(page);

    await page.route("**/rest/v1/answer_bank**", async (route) => {
      if (route.request().method() === "GET") {
        const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5000";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
          },
          body: JSON.stringify([
            {
              id: "ans-1",
              user_id: "e2e-user-0001-0001-0001-000000000001",
              question_text: "Tell me about leadership",
              answer_text: "I led a cross-functional launch.",
              category: "Behavioural",
              source: "manual",
              tags: ["star"],
              is_favourite: false,
              times_used: 0,
              last_used_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted_at: null,
            },
          ]),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/app/answers", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Tell me about leadership/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel(/Search answers/i).fill("zzzz-no-match");
    await expect(page.getByText(/No matching answers/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
