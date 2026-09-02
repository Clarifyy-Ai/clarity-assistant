/**
 * Duplicate-request coalescing + async job poller inventory.
 *
 * | Domain    | Poller export                      | Module                              | Dedup / guard                         | Status fetch                         |
 * |-----------|------------------------------------|-------------------------------------|---------------------------------------|--------------------------------------|
 * | Gov exam  | pollPaperJobUntilTerminal          | lib/gov-exam/pollPaperJob.ts        | UI-scoped poller; backoff on 429/5xx  | getPaperGenerationJob → fetchEdge    |
 * | Gov PDF   | pollParseQuestionPdfJob            | lib/gov-exam/parseQuestionPdfJob.ts | singleFlight on GET job status        | getParseQuestionPdfJob               |
 * | Company   | pollCompanyResearchJobUntilTerminal| lib/company/companyResearchJob.ts   | UI-scoped poller; backoff on 429/5xx  | getCompanyResearchJob                |
 * | Documents | pollDocumentJobUntilDone           | lib/documents/processingJobs.ts     | activeDocumentPolls Map per jobId     | getDocumentProcessingJob → fetchEdge |
 * | Analytics | useAnalytics (loadAnalytics)       | hooks/useAnalytics.ts               | analyticsInflightRef joins in-flight  | fetchEdgeJson → analytics-dashboard  |
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  coalesceKey,
  inflightSizeForTests,
  resetSingleFlightForTests,
  singleFlight,
} from "@/lib/network/singleFlight";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const POLLER_INVENTORY = [
  {
    domain: "gov",
    exportName: "pollPaperJobUntilTerminal",
    modulePath: "lib/gov-exam/pollPaperJob.ts",
    statusFn: "getPaperGenerationJob",
    dedupPattern: /pollDelayMs|transientHits/,
  },
  {
    domain: "gov",
    exportName: "pollParseQuestionPdfJob",
    modulePath: "lib/gov-exam/parseQuestionPdfJob.ts",
    statusFn: "getParseQuestionPdfJob",
    dedupPattern: /singleFlight/,
  },
  {
    domain: "company",
    exportName: "pollCompanyResearchJobUntilTerminal",
    modulePath: "lib/company/companyResearchJob.ts",
    statusFn: "getCompanyResearchJob",
    dedupPattern: /pollDelayMs|transientHits/,
  },
  {
    domain: "documents",
    exportName: "pollDocumentJobUntilDone",
    modulePath: "lib/documents/processingJobs.ts",
    statusFn: "getDocumentProcessingJob",
    dedupPattern: /activeDocumentPolls/,
  },
  {
    domain: "analytics",
    exportName: "useAnalytics",
    modulePath: "hooks/useAnalytics.ts",
    statusFn: "analytics-dashboard",
    dedupPattern: /analyticsInflightRef/,
    exportPattern: /export function useAnalytics/,
  },
] as const;

const mockGetSession = vi.fn();
const mockGetPrivateMode = vi.fn(() => false);

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock("@/store/userStore", () => {
  const state: { session: { access_token: string } } = {
    session: { access_token: "store-token" },
  };
  return {
    useAuthStore: Object.assign(() => state, { getState: () => state }),
  };
});

vi.mock("@/hooks/usePrivateMode", () => ({
  getPrivateMode: () => mockGetPrivateMode(),
}));

vi.mock("@/lib/env", () => ({
  ENV: {},
  EDGE_BASE: "https://edge.test/functions/v1",
  SUPABASE_PUBLISHABLE_KEY: "anon-key",
}));

vi.mock("@/lib/billing/creditsManager", () => ({
  refreshCredits: vi.fn().mockResolvedValue(50),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  resetSingleFlightForTests();
  mockGetPrivateMode.mockReturnValue(false);
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "fresh-token" } },
    error: null,
  });
  global.fetch = vi.fn();
});

afterEach(() => {
  resetSingleFlightForTests();
  global.fetch = originalFetch;
});

function okJson(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function deferredEdgeFetch(fnName: string) {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: unknown) => {
    if (String(url ?? "").includes(fnName)) return promise;
    return Promise.resolve(okJson({}));
  });
  return {
    resolve: (body?: unknown) => resolve(okJson(body)),
  };
}

describe("singleFlight", () => {
  it("joins concurrent factories and clears after settle", async () => {
    let calls = 0;
    const hang = deferredFactory();
    const a = singleFlight("k", hang.run);
    const b = singleFlight("k", hang.run);
    expect(inflightSizeForTests()).toBe(1);
    hang.resolve(7);
    await expect(Promise.all([a, b])).resolves.toEqual([7, 7]);
    expect(calls).toBe(1);
    expect(inflightSizeForTests()).toBe(0);

    function deferredFactory() {
      let resolve!: (value: number) => void;
      return {
        run: () => {
          calls += 1;
          return new Promise<number>((res) => {
            resolve = res;
          });
        },
        resolve: (value: number) => resolve(value),
      };
    }
  });

  it("builds a stable coalesce key from method, function, and body", () => {
    const a = coalesceKey({
      method: "POST",
      fnName: "start-session",
      body: { action: "start", type: "live" },
    });
    const b = coalesceKey({
      method: "post",
      fnName: "/start-session/",
      body: { action: "start", type: "live" },
    });
    expect(a).toBe(b);
    expect(
      coalesceKey({
        method: "POST",
        fnName: "start-session",
        body: { action: "heartbeat" },
      }),
    ).not.toBe(a);
  });
});

function edgeCalls(fnName: string) {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
    String(call[0] ?? "").includes(fnName),
  );
}

describe("fetchEdge — one mutation per user action", () => {
  it("coalesces identical in-flight POSTs into a single fetch", { timeout: 15_000 }, async () => {
    const hang = deferredEdgeFetch("start-session");
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");
    const body = { action: "start", type: "live" };
    const p1 = fetchEdgeJson("start-session", body);
    const p2 = fetchEdgeJson("start-session", body);
    hang.resolve({ session_id: "s1" });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual(b);
    expect(edgeCalls("start-session")).toHaveLength(1);
  });

  it("issues a new request after the first flight settles", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(okJson({ n: 1 })),
    );
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");
    await fetchEdgeJson("generate-hint", { question: "q1" });
    await fetchEdgeJson("generate-hint", { question: "q1" });
    expect(edgeCalls("generate-hint")).toHaveLength(2);
  });

  it("does not join different bodies", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(okJson({ ok: true })),
    );
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");
    await Promise.all([
      fetchEdgeJson("generate-hint", { question: "q1" }),
      fetchEdgeJson("generate-hint", { question: "q2" }),
    ]);
    expect(edgeCalls("generate-hint")).toHaveLength(2);
  });

  it("attaches the same x-idempotency-key to coalesced mutation POSTs", { timeout: 15_000 }, async () => {
    const hang = deferredEdgeFetch("deduct-credits");
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");
    const body = { action: "generate_hint" };
    const p1 = fetchEdgeJson("deduct-credits", body);
    const p2 = fetchEdgeJson("deduct-credits", body);
    hang.resolve({ ok: true });
    await Promise.all([p1, p2]);
    const calls = edgeCalls("deduct-credits");
    expect(calls).toHaveLength(1);
    const headers = (calls[0]?.[1] as { headers?: Record<string, string> } | undefined)?.headers ?? {};
    const key = headers["x-idempotency-key"] ?? headers["Idempotency-Key"];
    expect(key).toEqual(expect.stringMatching(/^deduct-credits:/));
    expect(String(key).length).toBeGreaterThanOrEqual(16);
  });

  it("does not overwrite a caller-supplied idempotency key", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(okJson({ ok: true })),
    );
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");
    await fetchEdgeJson(
      "deduct-credits",
      { action: "generate_hint" },
      { headers: { "x-idempotency-key": "caller-supplied-idem-key-01" } },
    );
    const headers =
      (edgeCalls("deduct-credits")[0]?.[1] as { headers?: Record<string, string> })?.headers ?? {};
    expect(headers["x-idempotency-key"]).toBe("caller-supplied-idem-key-01");
  });

  it.each([
    "generate-hint",
    "start-session",
    "schedule-interview",
    "deduct-credits",
    "razorpay-create-order",
  ] as const)("does not retry %s after Failed to fetch", async (fnName) => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: unknown) => {
      if (String(url ?? "").includes(fnName)) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve(okJson({}));
    });
    const { fetchEdgeJson } = await import("@/lib/network/fetchEdge");
    await expect(fetchEdgeJson(fnName, { probe: true })).rejects.toThrow();
    expect(edgeCalls(fnName)).toHaveLength(1);
  });
});

describe("async job poller inventory", () => {
  it.each(POLLER_INVENTORY)(
    "$domain — $exportName is present with status fetch and dedup guard",
    ({ modulePath, exportName, statusFn, dedupPattern, ...rest }) => {
      const source = fs.readFileSync(path.join(srcRoot, modulePath), "utf8");
      const exportPattern =
        "exportPattern" in rest && rest.exportPattern
          ? rest.exportPattern
          : new RegExp(`export async function ${exportName}`);
      expect(source).toMatch(exportPattern);
      expect(source).toContain(statusFn);
      expect(source).toMatch(dedupPattern);
    },
  );

  it("documents poller joins duplicate callers via activeDocumentPolls map", () => {
    const source = fs.readFileSync(
      path.join(srcRoot, "lib/documents/processingJobs.ts"),
      "utf8",
    );
    expect(source).toMatch(/activeDocumentPolls\.get\(jobId\)/);
    expect(source).toMatch(/if \(existing\) return existing/);
  });
});
