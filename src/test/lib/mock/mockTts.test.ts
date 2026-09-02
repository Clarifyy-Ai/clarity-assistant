import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  questionTtsIdentity,
  resetTtsModuleStateForTests,
  shouldRestartQuestionTts,
  speakQuestionText,
  stopBrowserTts,
  TTS_KEEPALIVE_MS,
  unlockBrowserTts,
} from "@/lib/mock/mockTts";

class FakeUtterance {
  text: string;
  volume = 1;
  rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function installSynth(overrides?: {
  speak?: (u: FakeUtterance) => void;
  getVoices?: () => SpeechSynthesisVoice[];
}) {
  const resume = vi.fn();
  const cancel = vi.fn();
  const spoken: FakeUtterance[] = [];
  const synth = {
    paused: false,
    speaking: false,
    pending: false,
    getVoices: overrides?.getVoices ?? (() => [{ name: "Test", lang: "en-IN" } as SpeechSynthesisVoice]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    resume,
    cancel: () => {
      synth.speaking = false;
      cancel();
    },
    speak: (u: FakeUtterance) => {
      spoken.push(u);
      synth.speaking = true;
      if (overrides?.speak) {
        overrides.speak(u);
        return;
      }
      queueMicrotask(() => u.onstart?.());
    },
  };
  // @ts-expect-error test stub
  globalThis.window = {
    ...globalThis.window,
    speechSynthesis: synth,
    SpeechSynthesisUtterance: FakeUtterance,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };
  globalThis.SpeechSynthesisUtterance = FakeUtterance as unknown as typeof SpeechSynthesisUtterance;
  return { synth, resume, cancel, spoken };
}

describe("question TTS identity", () => {
  it("does not restart on rapid timer/transcript ticks with the same question", () => {
    const first = questionTtsIdentity({ id: "q1", question_text: "Tell me about yourself." }, 0);
    expect(shouldRestartQuestionTts(null, first)).toBe(true);
    expect(shouldRestartQuestionTts(first, first)).toBe(false);
    expect(
      shouldRestartQuestionTts(first, { id: "q1", text: "Tell me about yourself." }),
    ).toBe(false);
  });

  it("restarts when the question id or text changes", () => {
    const first = questionTtsIdentity({ id: "q1", question_text: "Q1" }, 0);
    expect(shouldRestartQuestionTts(first, { id: "q2", text: "Q1" })).toBe(true);
    expect(shouldRestartQuestionTts(first, { id: "q1", text: "Q2" })).toBe(true);
  });

  it("treats empty text as silence (do not speak)", () => {
    expect(shouldRestartQuestionTts(null, { id: "q1", text: "" })).toBe(false);
  });
});

describe("mockTts playback", () => {
  beforeEach(() => {
    resetTtsModuleStateForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetTtsModuleStateForTests();
  });

  it("does not throw when speechSynthesis is unavailable", async () => {
    const original = globalThis.window;
    // @ts-expect-error test stub
    globalThis.window = { speechSynthesis: undefined };
    const outcome = await speakQuestionText("Hello interviewer", {
      questionId: "q1",
      isCurrent: () => true,
    });
    expect(outcome.status).toBe("unavailable");
    globalThis.window = original;
  });

  it("stopBrowserTts and unlockBrowserTts are safe without speechSynthesis", () => {
    expect(() => stopBrowserTts()).not.toThrow();
    expect(() => unlockBrowserTts()).not.toThrow();
  });

  it("plays successfully when the provider fires start then end", async () => {
    const { spoken } = installSynth();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const pending = speakQuestionText("Why do you want this role?", {
      questionId: "q1",
      isCurrent: () => true,
      onStart,
      onEnd,
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(spoken).toHaveLength(1);
    spoken[0].onend?.();
    await expect(pending).resolves.toMatchObject({ status: "ended" });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("returns blocked when autoplay never starts", async () => {
    installSynth({
      speak: () => {
        /* browser swallows speak() with no onstart */
      },
    });
    const pending = speakQuestionText("Describe a conflict.", {
      questionId: "q-auto",
      isCurrent: () => true,
      autoplayDetectMs: 200,
    });
    await vi.advanceTimersByTimeAsync(250);
    await expect(pending).resolves.toMatchObject({ status: "blocked", reason: "autoplay" });
  });

  it("returns blocked on not-allowed provider error", async () => {
    const { spoken } = installSynth({
      speak: (u) => {
        queueMicrotask(() => u.onerror?.({ error: "not-allowed" }));
      },
    });
    const pending = speakQuestionText("Walk me through a project.", {
      questionId: "q-deny",
      isCurrent: () => true,
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(spoken).toHaveLength(1);
    await expect(pending).resolves.toMatchObject({ status: "blocked" });
  });

  it("returns error when speak() throws (provider failure)", async () => {
    installSynth({
      speak: () => {
        throw new Error("synthesis-failed");
      },
    });
    const pending = speakQuestionText("What are your strengths?", {
      questionId: "q-err",
      isCurrent: () => true,
    });
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toMatchObject({ status: "error" });
  });

  it("returns unavailable for silence / empty text", async () => {
    installSynth();
    await expect(
      speakQuestionText("   ", { questionId: "q-empty", isCurrent: () => true }),
    ).resolves.toMatchObject({ status: "unavailable", reason: "empty" });
  });

  it("cancels when the question is no longer current", async () => {
    installSynth();
    const pending = speakQuestionText("Stale question", {
      questionId: "old",
      isCurrent: () => false,
    });
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toMatchObject({ status: "cancelled" });
  });

  it("keeps long sessions speaking by resuming the synth", async () => {
    const { synth, resume } = installSynth();
    const pending = speakQuestionText("Long behavioural answer prompt.", {
      questionId: "q-long",
      isCurrent: () => true,
    });
    await vi.advanceTimersByTimeAsync(50);
    synth.speaking = true;
    await vi.advanceTimersByTimeAsync(TTS_KEEPALIVE_MS + 20);
    expect(resume).toHaveBeenCalled();
    stopBrowserTts();
    pending.catch(() => undefined);
  });
});
