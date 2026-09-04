import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("usePwaInstallPrompt early capture", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers beforeinstallprompt at module load and calls preventDefault", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    await import("@/hooks/usePwaInstallPrompt");

    const beforeInstallCalls = addSpy.mock.calls.filter(
      (call) => call[0] === "beforeinstallprompt",
    );
    expect(beforeInstallCalls.length).toBeGreaterThanOrEqual(1);

    const handler = beforeInstallCalls[0]?.[1] as EventListener | undefined;
    expect(typeof handler).toBe("function");

    const preventDefault = vi.fn();
    const event = {
      type: "beforeinstallprompt",
      preventDefault,
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    } as unknown as Event;

    handler?.(event);
    expect(preventDefault).toHaveBeenCalled();

    const { hasDeferredInstallPrompt } = await import("@/hooks/usePwaInstallPrompt");
    expect(hasDeferredInstallPrompt()).toBe(true);
  });
});
