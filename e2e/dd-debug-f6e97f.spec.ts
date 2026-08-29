/**
 * DD-001/002/003 automated runtime evidence (debug session f6e97f).
 */
import { test, expect } from "../playwright-fixture";
import {
  loginAsTestUser,
  dismissCookieBanner,
  E2E_TEST_USER,
  dismissWalkthrough,
} from "./helpers/auth-flow";
import type { Page, Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const LOG = path.resolve("debug-f6e97f.log");
const SESSION_ID = "e2e-mock-session-f6e97f-0001-0001-000000000001";

function log(entry: Record<string, unknown>) {
  fs.appendFileSync(
    LOG,
    JSON.stringify({ sessionId: "f6e97f", timestamp: Date.now(), runId: "auto-repro", ...entry }) +
      "\n",
  );
}

function fulfillJson(route: Route, status: number, body: unknown) {
  const origin = route.request().headers()["origin"] ?? "http://127.0.0.1:5173";
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers":
        "authorization, apikey, content-type, x-client-info, x-idempotency-key, idempotency-key, x-request-id",
      vary: "Origin",
    },
    body: JSON.stringify(body),
  });
}

async function mockSessionApis(page: Page) {
  await page.route("**/functions/v1/generate-questions**", async (route) => {
    if (route.request().method() === "OPTIONS") return fulfillJson(route, 204, {});
    return fulfillJson(route, 200, {
      success: true,
      source: "ai",
      questions: [
        {
          id: "e2e-q-1",
          question_text: "Tell me about a time you led a difficult project.",
          question: "Tell me about a time you led a difficult project.",
          difficulty: "medium",
          type: "behavioral",
          tags: [],
          order: 1,
        },
      ],
      count: 1,
    });
  });

  await page.route("**/functions/v1/start-session**", async (route) => {
    if (route.request().method() === "OPTIONS") return fulfillJson(route, 204, {});
    return fulfillJson(route, 200, {
      session_id: SESSION_ID,
      reused: true,
      status: "active",
      lifecycle_status: "IN_PROGRESS",
      config: {},
      started_at: new Date().toISOString(),
    });
  });

  await page.route("**/functions/v1/finalize-session**", async (route) => {
    if (route.request().method() === "OPTIONS") return fulfillJson(route, 204, {});
    return fulfillJson(route, 200, {
      ok: true,
      session_id: SESSION_ID,
      status: "completed",
      lifecycle_status: "COMPLETED",
      terminal_reason: "USER_ENDED",
    });
  });

  await page.route("**/functions/v1/end-session**", async (route) => {
    if (route.request().method() === "OPTIONS") return fulfillJson(route, 204, {});
    return fulfillJson(route, 200, {
      session_id: SESSION_ID,
      status: "completed",
      already_terminal: true,
    });
  });

  const sessionRow = {
    id: SESSION_ID,
    user_id: E2E_TEST_USER.id,
    type: "mock",
    status: "in_progress",
    title: "Mock interview",
    questions_asked: 3,
    answers_generated: 0,
    credits_used: 0,
    model_used: "gemini-flash",
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    ended_at: null,
    document_id: null,
    jd_id: null,
  };

  await page.route("**/rest/v1/sessions**", async (route) => {
    const method = route.request().method();
    if (method === "GET") return fulfillJson(route, 200, [sessionRow]);
    if (method === "POST") return fulfillJson(route, 201, [sessionRow]);
    if (method === "PATCH" || method === "PUT") {
      return fulfillJson(route, 200, [{ ...sessionRow, status: "completed" }]);
    }
    return fulfillJson(route, 200, []);
  });

  await page.route("**/rest/v1/rpc/check_free_tier_limits**", async (route) => {
    return fulfillJson(route, 200, { allowed: true, remaining: 3 });
  });

  await page.route("**/rest/v1/session_answers**", async (route) => {
    return fulfillJson(route, 201, []);
  });

  await page.route("**/rest/v1/session_transcripts**", async (route) => {
    return fulfillJson(route, 201, []);
  });
}

test.describe("DD debug repro f6e97f", () => {
  test.use({ permissions: ["microphone"] });

  test("certificate whitespace + mock end modal a11y + TTS path", async ({ page }) => {
    page.on("console", (msg) => {
      const text = msg.text();
      if (/DialogContent|aria-describedby|Description|Missing/i.test(text)) {
        log({
          hypothesisId: "H1",
          location: "e2e:console",
          message: "a11y console",
          data: { type: msg.type(), text: text.slice(0, 500) },
        });
      }
    });

    page.on("response", (res) => {
      if (res.status() === 503 && /functions\/v1\//.test(res.url())) {
        log({
          hypothesisId: "H2",
          location: "e2e:network",
          message: "edge 503",
          data: { url: res.url().slice(0, 220), status: 503 },
        });
      }
    });

    // Certificate
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/verify-certificate/CLR-2026-57055017`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page
      .getByText(/CLR-2026-57055017|Invalid certificate|Could not verify|Checking certificate/i)
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1500);
    const certGeo = await page.evaluate(() => {
      const card = document.querySelector(
        "[data-testid='certificate-card'] [data-certificate-surface], [data-testid='certificate-card'], main .rounded-2xl",
      );
      const r = card?.getBoundingClientRect();
      const text = document.body?.innerText || "";
      return {
        viewportW: window.innerWidth,
        cardW: r ? Math.round(r.width) : null,
        cardH: r ? Math.round(r.height) : null,
        fillRatio: r ? Number((r.width / window.innerWidth).toFixed(3)) : null,
        hasValid: text.includes("CLR-2026-57055017") || text.includes("QA Audit"),
        hasCrash: text.includes("voidMicrotask"),
        statusSnippet: text.slice(0, 280),
      };
    });
    log({ hypothesisId: "H11", location: "e2e:cert", message: "cert geometry", data: certGeo });
    expect(certGeo.hasCrash).toBeFalsy();
    if (certGeo.hasValid && certGeo.fillRatio != null) {
      expect(certGeo.fillRatio).toBeGreaterThan(0.55);
    }

    // Mock session
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(String(err.message || err).slice(0, 300));
      log({
        hypothesisId: "H6",
        location: "e2e:pageerror",
        message: "page error",
        data: { err: String(err.message || err).slice(0, 300) },
      });
    });
    await loginAsTestUser(page);
    await mockSessionApis(page);
    await page.evaluate(
      ({ sessionId, userId }) => {
        try {
          localStorage.setItem("clarify:whats-new-dismissed", "99.0.0");
          localStorage.setItem(
            "Clarify AI-app-walkthrough-v1",
            JSON.stringify({ [userId]: true }),
          );
          sessionStorage.setItem(
            `clarify:mock-config:${sessionId}`,
            JSON.stringify({
              company: "Acme",
              role: "Software Engineer",
              hint_style: "short_hints",
              model: "gemini-flash",
              smart_routing: true,
              stealth_mode: false,
              resume_id: null,
              jd_id: null,
              interview_type: "behavioural",
              question_count: 3,
              difficulty: "medium",
              instructions: "",
              enable_system_audio: false,
              mic_device_id: null,
              noise_suppression: true,
            }),
          );
        } catch {
          /* ignore */
        }
      },
      { sessionId: SESSION_ID, userId: E2E_TEST_USER.id },
    );

    await page.goto(`/app/mock/session/${SESSION_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await dismissCookieBanner(page);
    await dismissWalkthrough(page);

    await expect(page.getByTestId("mock-current-question")).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(2500);

    const ttsState = await page.evaluate(() => ({
      hasSynth: "speechSynthesis" in window,
      speaking: window.speechSynthesis?.speaking ?? null,
      pending: window.speechSynthesis?.pending ?? null,
      voices: window.speechSynthesis?.getVoices?.().length ?? -1,
    }));
    log({ hypothesisId: "H6", location: "e2e:tts-state", message: "tts after question", data: ttsState });
    expect(ttsState.hasSynth).toBe(true);

    // Dismiss any blocking dialog overlay (WhatsNew / walkthrough / a11y dialogs).
    for (let i = 0; i < 3; i++) {
      const overlay = page.locator('[data-state="open"].fixed.inset-0');
      if ((await overlay.count()) === 0) break;
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.getByRole("button", { name: /got it|skip|close|continue|dismiss/i }).first().click({ timeout: 1_500 }).catch(() => undefined);
      await page.waitForTimeout(300);
    }

    await page.getByTestId("mock-end-session").click({ force: true });
    await expect(page.getByRole("button", { name: /end & save/i })).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(800);
    const a11yDescribed = await page.evaluate(() => {
      const content = document.querySelector('[role="dialog"]');
      return {
        hasDialog: !!content,
        describedBy: content?.getAttribute("aria-describedby"),
        title: content?.querySelector("h2, [id]")?.textContent?.slice(0, 80) ?? null,
      };
    });
    log({
      hypothesisId: "H1",
      location: "e2e:end-modal",
      message: "end confirm modal visible",
      data: { visible: true, ...a11yDescribed },
    });

    await page.getByRole("button", { name: /end & save/i }).click();
    await page.waitForTimeout(2000);
    log({
      hypothesisId: "info",
      location: "e2e:done",
      message: "repro finished",
      data: {
        ok: true,
        pageErrors,
        voidMicrotaskCrash: pageErrors.some((e) => /voidMicrotask/i.test(e)),
      },
    });
    expect(pageErrors.some((e) => /voidMicrotask/i.test(e))).toBe(false);
  });
});
