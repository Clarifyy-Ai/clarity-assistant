import { describe, expect, it } from "vitest";
import { loadLiveTranscriptionConfig } from "@/lib/audio/transcription/config";

describe("live transcription config", () => {
  it("defaults to nova-3 for mock + Practice Coach STT", () => {
    const cfg = loadLiveTranscriptionConfig();
    expect(cfg.model).toBe("nova-3");
    expect(cfg.enabled).toBe(true);
    expect(cfg.interimResults).toBe(true);
  });
});
