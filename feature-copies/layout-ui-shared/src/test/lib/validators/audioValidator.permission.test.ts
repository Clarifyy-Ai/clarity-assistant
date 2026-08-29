import { describe, expect, it, vi } from "vitest";
import { validateMicPermission } from "@/lib/validators/audioValidator";

describe("validateMicPermission", () => {
  it("does not fail closed when the Permissions API cannot query microphone", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    vi.stubGlobal("MediaRecorder", class {});
    vi.stubGlobal("AudioContext", class {});
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: async () => {
          throw new TypeError("not supported");
        },
      },
    });
    const result = await validateMicPermission();
    expect(result.valid).toBe(true);
  });
});
