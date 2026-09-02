import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("debugIngest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("does not fetch in production when no secure ingest URL is configured", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DEBUG_INGEST_URL", "");
    const { postDebugIngest } = await import("@/lib/debug/debugIngest");
    postDebugIngest("4a9592", {
      hypothesisId: "H1",
      location: "test",
      message: "noop in prod",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects localhost production ingest URLs", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DEBUG_INGEST_URL", "http://127.0.0.1:7572/ingest/test");
    const { resolveProductionTelemetryUrl } = await import("@/lib/debug/debugIngest");
    expect(resolveProductionTelemetryUrl()).toBeNull();
  });

  it("posts fire-and-forget to a configured HTTPS ingest URL in production", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DEBUG_INGEST_URL", "https://telemetry.example.com/ingest");
    const { postDebugIngest, resolveProductionTelemetryUrl } = await import("@/lib/debug/debugIngest");
    expect(resolveProductionTelemetryUrl()).toBe("https://telemetry.example.com/ingest");
    postDebugIngest("161d95", {
      hypothesisId: "H1",
      location: "test.ts",
      message: "prod https",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://telemetry.example.com/ingest",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts to same-origin dev sink without localhost in production mode flag off", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_DEBUG_INGEST_URL", "");
    const { postDebugIngest } = await import("@/lib/debug/debugIngest");
    postDebugIngest("161d95", {
      hypothesisId: "H1",
      location: "test.ts",
      message: "dev sink",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/__agent_debug_161d95",
      expect.objectContaining({ method: "POST" }),
    );
    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(url).not.toMatch(/127\.0\.0\.1|localhost:7572/);
  });

  it("agentDebugIngest no-ops in production without secure ingest URL", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DEBUG_INGEST_URL", "");
    const { agentDebugIngest } = await import("@/lib/debug/agentIngest");
    agentDebugIngest({
      hypothesisId: "H1",
      location: "test.ts",
      message: "prod noop via agent wrapper",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("swallows fetch failures without throwing", async () => {
    vi.stubEnv("DEV", true);
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    const { postDebugIngest } = await import("@/lib/debug/debugIngest");
    expect(() =>
      postDebugIngest("4a9592", {
        hypothesisId: "H1",
        location: "test.ts",
        message: "fire and forget",
      }),
    ).not.toThrow();
    await Promise.resolve();
  });
});
