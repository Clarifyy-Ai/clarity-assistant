import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockGetSession = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

const originalFetch = global.fetch;
const originalEnv = import.meta.env.VITE_SCRAPER_URL;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "admin-jwt" } },
    error: null,
  });
  import.meta.env.VITE_SCRAPER_URL = "https://scraper.test";
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  import.meta.env.VITE_SCRAPER_URL = originalEnv;
});

describe("scraperApi — JWT admin paths", () => {
  it("calls /scrape/sources with Bearer JWT", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ supported: ["UPSC", "SSC_CGL"] }), { status: 200 }),
    );
    const { scraperApi } = await import("@/lib/scraper/client");

    const res = await scraperApi.sources();
    expect(res.supported).toEqual(["UPSC", "SSC_CGL"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://scraper.test/scrape/sources",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer admin-jwt",
        }),
      }),
    );
  });

  it("calls /paper-factory/exams with Bearer JWT", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, count: 1, exams: [{ code: "UPSC", name: "UPSC CSE" }] }),
        { status: 200 },
      ),
    );
    const { scraperApi } = await import("@/lib/scraper/client");

    const res = await scraperApi.paperFactoryExams();
    expect(res.count).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://scraper.test/paper-factory/exams",
      expect.any(Object),
    );
  });

  it("calls /paper-factory/plan with Bearer JWT", async () => {
    vi.resetModules();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, plan: { total_questions: 25 } }),
        { status: 200 },
      ),
    );
    const { scraperApi } = await import("@/lib/scraper/client");

    const res = await scraperApi.paperFactoryPlan({
      exam: "UPSC",
      mode: "generated_mock",
      question_count: 25,
    });
    expect(res.plan).toEqual({ total_questions: 25 });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://scraper.test/paper-factory/plan",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer admin-jwt",
        }),
      }),
    );
  });

  it("calls /paper-factory/generate with Bearer JWT", async () => {
    vi.resetModules();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, question_count: 25, complete: true }),
        { status: 200 },
      ),
    );
    const { scraperApi } = await import("@/lib/scraper/client");

    const res = await scraperApi.paperFactoryGenerate({
      exam: "SSC",
      question_count: 25,
      include_questions: false,
    });
    expect(res.complete).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://scraper.test/paper-factory/generate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer admin-jwt",
        }),
      }),
    );
  });

  it("calls /paper-factory/jobs/{id}/process with Bearer JWT", async () => {
    vi.resetModules();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, job_id: "job-1", paper_id: "paper-1" }),
        { status: 200 },
      ),
    );
    const { scraperApi } = await import("@/lib/scraper/client");

    const res = await scraperApi.paperFactoryProcessJob("job-1");
    expect(res.paper_id).toBe("paper-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://scraper.test/paper-factory/jobs/job-1/process",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer admin-jwt",
        }),
      }),
    );
  });

  it("throws ScraperNotConfiguredError when VITE_SCRAPER_URL is unset", async () => {
    import.meta.env.VITE_SCRAPER_URL = "";
    vi.resetModules();
    const { scraperApi, ScraperNotConfiguredError } = await import("@/lib/scraper/client");

    await expect(scraperApi.sources()).rejects.toBeInstanceOf(ScraperNotConfiguredError);
  });

  it("treats localhost VITE_SCRAPER_URL as unset in production", async () => {
    const originalAppEnv = import.meta.env.VITE_APP_ENV;
    import.meta.env.VITE_SCRAPER_URL = "http://127.0.0.1:8000";
    import.meta.env.VITE_APP_ENV = "production";
    vi.resetModules();
    try {
      const { scraperApi, ScraperNotConfiguredError } = await import("@/lib/scraper/client");
      expect(scraperApi.isConfigured()).toBe(false);
      await expect(scraperApi.sources()).rejects.toBeInstanceOf(ScraperNotConfiguredError);
    } finally {
      import.meta.env.VITE_APP_ENV = originalAppEnv;
    }
  });
});
