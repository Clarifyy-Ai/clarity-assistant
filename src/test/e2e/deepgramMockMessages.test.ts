import { describe, expect, it } from "vitest";
import {
  buildDeepgramFinalResult,
  buildDeepgramInterimResult,
  buildDefaultTranscriptionSchedule,
  buildE2eTranscriptionSchedule,
} from "./deepgramMockMessages";

describe("deepgramMockMessages", () => {
  it("builds interim Results payloads", () => {
    const payload = buildDeepgramInterimResult("Hello wor");
    expect(payload.type).toBe("Results");
    expect(payload.is_final).toBe(false);
    expect((payload.channel as { alternatives: { transcript: string }[] }).alternatives[0]
      .transcript).toBe("Hello wor");
  });

  it("builds final Results payloads with speaker words", () => {
    const payload = buildDeepgramFinalResult("Hello world", { speaker: 1 });
    expect(payload.is_final).toBe(true);
    const alt = (payload.channel as { alternatives: { words: { speaker: number }[] }[] })
      .alternatives[0];
    expect(alt.words.length).toBe(2);
    expect(alt.words[0]?.speaker).toBe(1);
  });

  it("orders partial then final in the default schedule", () => {
    const schedule = buildDefaultTranscriptionSchedule("Hello wor", "Hello world");
    expect(schedule).toHaveLength(2);
    expect(schedule[0]?.payload.is_final).toBe(false);
    expect(schedule[1]?.payload.is_final).toBe(true);
    expect((schedule[1]?.delayMs ?? 0)).toBeGreaterThan(schedule[0]?.delayMs ?? 0);
  });

  it("keeps a long gap before final in the e2e schedule", () => {
    const schedule = buildE2eTranscriptionSchedule("Hello wor", "Hello world", 25_000);
    expect(schedule[1]?.delayMs).toBe(25_000);
  });
});
