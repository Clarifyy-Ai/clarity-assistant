import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const envStore: Record<string, string> = {
  APP_ENV: "production",
  ALLOWED_ORIGINS: "https://clarityapp.ai,https://www.clarityapp.ai,https://clarify.ai.sltfinanceindia.com",
  ALLOW_LOCALHOST_ORIGINS: "true",
  ALLOW_PREVIEW_ORIGINS: "true",
  ALLOW_ELECTRON_NULL_ORIGIN: "true",
};

vi.hoisted(() => {
  (globalThis as { Deno?: unknown }).Deno = {
    env: {
      get: (_key: string) => undefined,
    },
    serve: (handler: unknown) => handler,
  };
});

import {
  applyCors,
  corsError,
  getCorsHeaders,
  handleCors,
  resetCorsCacheForTests,
  restoreCorsEnvForTests,
  setCorsEnvForTests,
  unexpectedErrorResponse,
  withBrowserCors,
} from "../../../../supabase/functions/_shared/cors";

const APPROVED = "https://clarityapp.ai";
const LOCALHOST = "http://127.0.0.1:5000";
const UNAPPROVED = "https://evil.example";
const PREVIEW = "https://preview-abc.lovable.app";

function makeReq(
  method: string,
  origin?: string,
  extra: Record<string, string> = {},
  url = "https://qzgvjrvtkwlzxpmlddkx.supabase.co/functions/v1/search-exams",
): Request {
  const headers = new Headers(extra);
  if (origin) headers.set("Origin", origin);
  return new Request(url, { method, headers });
}

function acao(res: Response): string | null {
  return res.headers.get("Access-Control-Allow-Origin");
}

const BROWSER_FUNCTIONS = [
  "search-exams",
  "submit-test",
  "generate-questions",
  "generate-answer",
  "prep-tool",
  "company-research",
  "export-user-data",
  "parse-resume",
  "parse-document",
  "parse-question-pdf",
  "razorpay-create-order",
  "razorpay-verify-payment",
  "deduct-credits",
  "start-session",
  "end-session",
  "ai-coach-chat",
  "generate-star-answer",
  "create-test",
  "assemble-assessment",
];

const STATUS_PATHS = [200, 201, 202, 204, 400, 401, 402, 403, 422, 429, 500, 502, 503];

describe("shared Edge Function CORS contract", () => {
  beforeEach(() => {
    setCorsEnvForTests({
      get: (key: string) => envStore[key],
    });
    resetCorsCacheForTests();
  });

  it("echoes an approved origin and never uses wildcard with credentials", () => {
    const req = makeReq("POST", APPROVED);
    const headers = getCorsHeaders(req);
    expect(headers["Access-Control-Allow-Origin"]).toBe(APPROVED);
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(headers["Access-Control-Allow-Origin"]).not.toBe("*");
    expect(headers.Vary).toBe("Origin");
    expect(headers["Access-Control-Allow-Headers"]).toMatch(/authorization/i);
    expect(headers["Access-Control-Allow-Headers"]).toMatch(/apikey/i);
    expect(headers["Access-Control-Allow-Headers"]).toMatch(/x-idempotency-key/i);
    expect(headers["Access-Control-Allow-Headers"]).toMatch(/x-client-info/i);
    expect(headers["Access-Control-Allow-Headers"]).toMatch(/x-request-id/i);
  });

  it("allows localhost development origins", () => {
    const headers = getCorsHeaders(makeReq("POST", LOCALHOST));
    expect(headers["Access-Control-Allow-Origin"]).toBe(LOCALHOST);
  });

  it("rejects unapproved origins without granting CORS access", () => {
    const headers = getCorsHeaders(makeReq("POST", UNAPPROVED));
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("OPTIONS + approved origin returns 204 with CORS before auth", async () => {
    const handler = withBrowserCors("search-exams", async () => {
      throw new Error("must not run business logic on preflight");
    });
    const res = await handler(
      makeReq("OPTIONS", APPROVED, {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,apikey,content-type",
      }),
    );
    expect(res.status).toBe(204);
    expect(acao(res)).toBe(APPROVED);
  });

  it("OPTIONS + unapproved origin is rejected without ACAO", async () => {
    const handler = withBrowserCors("search-exams", async () => {
      return new Response("should not run", { status: 200 });
    });
    const res = await handler(makeReq("OPTIONS", UNAPPROVED));
    expect(res.status).toBe(403);
    expect(acao(res)).toBeNull();
    const body = await res.json();
    expect(body.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it.each(STATUS_PATHS)("attaches CORS on HTTP %s responses that forgot headers", async (status) => {
    const handler = withBrowserCors("submit-test", async () => {
      return new Response(status === 204 ? null : JSON.stringify({ ok: status !== 204 }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    });
    const res = await handler(makeReq("POST", APPROVED));
    expect(res.status).toBe(status);
    expect(acao(res)).toBe(APPROVED);
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("x-correlation-id")).toBeTruthy();
  });

  it("wraps unexpected exceptions as a safe CORS JSON error", async () => {
    const handler = withBrowserCors("search-exams", async () => {
      throw new Error("password=supersecret postgres://internal");
    });
    const res = await handler(makeReq("POST", APPROVED, { "x-request-id": "corr-test-1" }));
    expect([500, 503]).toContain(res.status);
    expect(acao(res)).toBe(APPROVED);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toMatch(/INTERNAL_ERROR|SERVICE_UNAVAILABLE/);
    expect(JSON.stringify(body)).not.toMatch(/password=supersecret|postgres:\/\//i);
    expect(body.correlation_id).toBe("corr-test-1");
  });

  it("applies CORS to thrown Response objects from requireAuth", async () => {
    const handler = withBrowserCors("submit-test", async () => {
      throw new Response(JSON.stringify({ error: "Unauthorized.", code: "AUTH_REQUIRED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });
    const res = await handler(makeReq("POST", APPROVED));
    expect(res.status).toBe(401);
    expect(acao(res)).toBe(APPROVED);
  });

  it("rate-limit shaped 429/503 responses become readable with CORS via applyCors", () => {
    const denied = applyCors(
      makeReq("POST", APPROVED),
      new Response(JSON.stringify({ error: "Rate limit exceeded.", code: "RATE_LIMITED" }), {
        status: 429,
      }),
    );
    expect(denied.status).toBe(429);
    expect(acao(denied)).toBe(APPROVED);

    const outage = applyCors(
      makeReq("POST", LOCALHOST),
      new Response(
        JSON.stringify({ error: "Temporary service unavailability.", code: "RATE_LIMIT_BACKEND_UNAVAILABLE" }),
        { status: 503 },
      ),
    );
    expect(outage.status).toBe(503);
    expect(acao(outage)).toBe(LOCALHOST);
  });

  it("corsError keeps a string error field for fetchEdgeJson compatibility", async () => {
    const res = corsError(makeReq("POST", APPROVED), 402, "PAYMENT_REQUIRED", "Credits required.");
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.code).toBe("PAYMENT_REQUIRED");
    expect(acao(res)).toBe(APPROVED);
  });

  it("handleCors returns null for non-OPTIONS so auth can run next", () => {
    expect(handleCors(makeReq("POST", APPROVED))).toBeNull();
  });

  it("allows Lovable preview origins when enabled", () => {
    expect(getCorsHeaders(makeReq("POST", PREVIEW))["Access-Control-Allow-Origin"]).toBe(PREVIEW);
  });

  it("disables preview origins when ALLOW_PREVIEW_ORIGINS=false", () => {
    setCorsEnvForTests({
      get: (key: string) =>
        key === "ALLOW_PREVIEW_ORIGINS" ? "false" : envStore[key],
    });
    expect(getCorsHeaders(makeReq("POST", PREVIEW))["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("allows Electron Origin: null without credentialed wildcard", () => {
    const headers = getCorsHeaders(makeReq("POST", "null"));
    expect(headers["Access-Control-Allow-Origin"]).toBe("null");
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("defaults ALLOW_ELECTRON_NULL_ORIGIN to true when unset", () => {
    setCorsEnvForTests({
      get: (key: string) =>
        key === "ALLOW_ELECTRON_NULL_ORIGIN" ? undefined : envStore[key],
    });
    const headers = getCorsHeaders(makeReq("POST", "null"));
    expect(headers["Access-Control-Allow-Origin"]).toBe("null");
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("infrastructure unexpectedErrorResponse is 503 + CORS and leak-free", async () => {
    const res = unexpectedErrorResponse(
      makeReq("POST", APPROVED),
      "search-exams",
      new Error("fetch failed: ECONNREFUSED 10.0.0.1"),
    );
    expect(res.status).toBe(503);
    expect(acao(res)).toBe(APPROVED);
    const body = await res.json();
    expect(body.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.1/);
  });

  it.each(BROWSER_FUNCTIONS)("%s uses the shared CORS wrapper contract", async (fnName) => {
    const handler = withBrowserCors(fnName, async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const res = await handler(makeReq("POST", APPROVED, {}, `https://example.supabase.co/functions/v1/${fnName}`));
    expect(acao(res)).toBe(APPROVED);
    expect(res.headers.get("x-correlation-id")).toBeTruthy();
  });
});

describe("Edge Function CORS import catalog", () => {
  it("every function imports the shared CORS module (directly or via utils/auth/retired)", () => {
    restoreCorsEnvForTests();
    const functionsDir = path.resolve(
      __dirname,
      "../../../../supabase/functions",
    );
    const entries = fs.readdirSync(functionsDir, { withFileTypes: true });
    const missing: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      const indexPath = path.join(functionsDir, entry.name, "index.ts");
      if (!fs.existsSync(indexPath)) continue;
      const source = fs.readFileSync(indexPath, "utf8");
      const importsShared =
        source.includes("_shared/cors.ts") ||
        source.includes("_shared/utils.ts") ||
        source.includes("_shared/auth.ts") ||
        source.includes("_shared/retired.ts");
      if (!importsShared) missing.push(entry.name);
    }

    expect(missing).toEqual([]);
  });
});

afterAll(() => {
  restoreCorsEnvForTests();
});
