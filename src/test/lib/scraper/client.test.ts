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

  it("throws ScraperNotConfiguredError when VITE_SCRAPER_URL is unset", async () => {
    import.meta.env.VITE_SCRAPER_URL = "";
    vi.resetModules();
    const { scraperApi, ScraperNotConfiguredError } = await import("@/lib/scraper/client");

    await expect(scraperApi.sources()).rejects.toBeInstanceOf(ScraperNotConfiguredError);
  });
});
