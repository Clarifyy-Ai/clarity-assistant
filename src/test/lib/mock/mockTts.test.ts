import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTERVIEWER_VOICE_CATALOGUE,
  describeVoiceDeliveryMode,
  getInterviewerVoice,
  getInterviewerVoiceTextFallback,
  resolveBrowserVoiceForCatalogue,
} from "@/lib/mock/interviewerVoiceCatalog";
import {
  getServerTtsClientStatus,
  isServerTtsClientEnabled,
  requestServerTts,
} from "@/lib/mock/serverTts";
import {
  previewCatalogueVoice,
  questionTtsIdentity,
  resetTtsModuleStateForTests,
  shouldRestartQuestionTts,
  speakInterviewerWithFallback,
  speakQuestionText,
  stopBrowserTts,
  TTS_KEEPALIVE_MS,
  unlockBrowserTts,
} from "@/lib/mock/mockTts";
import {
  countScorableMockAnswers,
  mockSessionHasScorecardEvidence,
} from "@/lib/mock/durableMockTurns";

const fetchEdgeJson = vi.hoisted(() => vi.fn());

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

class FakeUtterance {
  text: string;
  volume = 1;
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
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
    getVoices:
      overrides?.getVoices ??
      (() =>
        [
          { name: "Microsoft David", lang: "en-US" },
          { name: "Microsoft Zira", lang: "en-US" },
          { name: "Google UK English Female", lang: "en-GB" },
        ] as SpeechSynthesisVoice[]),
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

describe("interviewer voice catalogue", () => {
  it("exposes the six controlled voices with preview + text fallback", () => {
    const labels = INTERVIEWER_VOICE_CATALOGUE.map((v) => v.label);
    expect(labels).toEqual([
      "Classic Professional",
      "Calm Mentor",
      "Clear Interviewer",
      "Warm Recruiter",
      "Technical Panelist",
      "Executive Formal",
    ]);
    for (const voice of INTERVIEWER_VOICE_CATALOGUE) {
      expect(voice.previewText.trim().length).toBeGreaterThan(8);
      expect(voice.textFallback.trim().length).toBeGreaterThan(8);
      expect(getInterviewerVoiceTextFallback(voice.id)).toBe(voice.textFallback);
    }
    expect(getInterviewerVoice("missing").id).toBe("classic_professional");
  });

  it("maps browser voices with validated catalogue hints", () => {
    installSynth();
    const mapped = resolveBrowserVoiceForCatalogue("classic_professional");
    expect(mapped).toBeTruthy();
    expect(describeVoiceDeliveryMode(false)).toBe("browser_fallback_only");
    expect(describeVoiceDeliveryMode(true)).toBe("server_available");
  });
});

describe("server TTS honesty", () => {
  const originalEnv = import.meta.env.VITE_ENABLE_SERVER_TTS;

  afterEach(() => {
    vi.stubEnv("VITE_ENABLE_SERVER_TTS", originalEnv ?? "");
    fetchEdgeJson.mockReset();
  });

  it("reports disabled when VITE_ENABLE_SERVER_TTS is off", async () => {
    vi.stubEnv("VITE_ENABLE_SERVER_TTS", "");
    expect(isServerTtsClientEnabled()).toBe(false);
    expect(getServerTtsClientStatus().enabled).toBe(false);
    const res = await requestServerTts({
      text: "Hello",
      voice_id: "classic_professional",
      playback_id: "p1",
    });
    expect(res.unavailable).toBe(true);
    expect(res.source).toBe("unavailable");
    expect(fetchEdgeJson).not.toHaveBeenCalled();
  });

  it("does not fake server audio when Edge returns unavailable", async () => {
    vi.stubEnv("VITE_ENABLE_SERVER_TTS", "true");
    fetchEdgeJson.mockResolvedValue({
      unavailable: true,
      message: "Server TTS not enabled",
    });
    const res = await requestServerTts({
      text: "Tell me about yourself.",
      voice_id: "calm_mentor",
      playback_id: "p2",
    });
    expect(res.unavailable).toBe(true);
    expect(res.source).toBe("unavailable");
    expect(res.audio_url).toBeUndefined();
    expect(res.audio_base64).toBeUndefined();
  });

  it("accepts real Edge audio only when provided", async () => {
    vi.stubEnv("VITE_ENABLE_SERVER_TTS", "true");
    fetchEdgeJson.mockResolvedValue({
      unavailable: false,
      audio_base64: "aaa",
      audio_mime: "audio/mpeg",
    });
    const res = await requestServerTts({
      text: "Why this role?",
      voice_id: "warm_recruiter",
      playback_id: "p3",
    });
    expect(res.unavailable).toBe(false);
    expect(res.source).toBe("server");
    expect(res.audio_base64).toBe("aaa");
  });
});

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

describe("mockTts playback + fallback honesty", () => {
  beforeEach(() => {
    resetTtsModuleStateForTests();
    vi.useFakeTimers();
    vi.stubEnv("VITE_ENABLE_SERVER_TTS", "");
    fetchEdgeJson.mockReset();
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
    expect(outcome.source).toBe("none");
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
    await expect(pending).resolves.toMatchObject({ status: "ended", source: "browser" });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("falls back to browser when server TTS is unavailable", async () => {
    const { spoken } = installSynth();
    const pending = speakInterviewerWithFallback("Describe a conflict.", {
      questionId: "q-fallback",
      playbackId: "pb1",
      catalogueVoiceId: "clear_interviewer",
      isCurrent: () => true,
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(spoken).toHaveLength(1);
    spoken[0].onend?.();
    await expect(pending).resolves.toMatchObject({ status: "ended", source: "browser" });
    expect(fetchEdgeJson).not.toHaveBeenCalled();
  });

  it("previewCatalogueVoice uses browser-only path", async () => {
    vi.stubEnv("VITE_ENABLE_SERVER_TTS", "true");
    const { spoken } = installSynth();
    const pending = previewCatalogueVoice("calm_mentor");
    await vi.advanceTimersByTimeAsync(50);
    expect(spoken.length).toBeGreaterThan(0);
    spoken[0].onend?.();
    await expect(pending).resolves.toMatchObject({ source: "browser" });
    expect(fetchEdgeJson).not.toHaveBeenCalled();
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
    synth.paused = true;
    await vi.advanceTimersByTimeAsync(TTS_KEEPALIVE_MS + 20);
    expect(resume).toHaveBeenCalled();
    stopBrowserTts();
    pending.catch(() => undefined);
  });
});

describe("mock scorecard eligibility evidence", () => {
  it("counts non-empty answers as evidence even when status is not answered", () => {
    expect(
      countScorableMockAnswers([
        { skipped: false, status: "invalid", answer_text: "I led a migration for six months." },
        { skipped: true, status: "skipped", answer_text: "" },
        { skipped: false, status: "unanswered", answer_text: "" },
      ]),
    ).toBe(1);
    expect(
      mockSessionHasScorecardEvidence([
        { skipped: false, status: "answered", answer_text: "Solid answer with detail." },
      ]),
    ).toBe(true);
    expect(mockSessionHasScorecardEvidence([{ skipped: true, answer_text: "" }])).toBe(false);
  });
});
