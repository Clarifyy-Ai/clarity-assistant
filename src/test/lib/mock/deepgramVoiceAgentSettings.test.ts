import { describe, expect, it } from "vitest";
import {
  buildMockInterviewAgentSettings,
  DEEPGRAM_MOCK_AGENT_DEFAULTS,
  fluxSpeakModelForCatalogue,
  isDeepgramVoiceAgentEnabled,
  MOCK_INJECT_ONLY_THINK_PROMPT,
} from "@/lib/mock/deepgramVoiceAgentSettings";
import {
  DeepgramVoiceAgentSession,
  shouldResolveSpeakAfterAudioDone,
} from "@/lib/mock/deepgramVoiceAgentSession";

describe("deepgramVoiceAgentSettings (inject-only)", () => {
  it("defaults to flux-hannah speak with empty greeting", () => {
    expect(DEEPGRAM_MOCK_AGENT_DEFAULTS.type).toBe("Settings");
    expect(DEEPGRAM_MOCK_AGENT_DEFAULTS.agent.speak.provider.model).toBe("flux-hannah-en");
    expect(DEEPGRAM_MOCK_AGENT_DEFAULTS.agent.speak.provider.version).toBe("v2");
    expect(DEEPGRAM_MOCK_AGENT_DEFAULTS.agent.listen.provider.model).toBe("flux-general-en");
    expect(DEEPGRAM_MOCK_AGENT_DEFAULTS.agent.think.provider.model).toBe("gemini-2.5-flash");
    expect(DEEPGRAM_MOCK_AGENT_DEFAULTS.agent.greeting).toBe("");
    expect(DEEPGRAM_MOCK_AGENT_DEFAULTS.agent.think.prompt).toBe(MOCK_INJECT_ONLY_THINK_PROMPT);
    expect(DEEPGRAM_MOCK_AGENT_DEFAULTS.audio.input.sample_rate).toBe(48000);
    expect(DEEPGRAM_MOCK_AGENT_DEFAULTS.audio.output.sample_rate).toBe(24000);
  });

  it("builds inject-only settings with role context and no greeting", () => {
    const settings = buildMockInterviewAgentSettings({
      role: "Frontend Engineer",
      company: "Acme",
    });
    expect(settings.agent.greeting).toBe("");
    expect(settings.agent.think.prompt).toMatch(/Frontend Engineer/);
    expect(settings.agent.think.prompt).toMatch(/Acme/);
    expect(settings.agent.think.prompt).toMatch(/InjectAgentMessage/);
    expect(settings.agent.think.prompt).not.toMatch(/Greet the candidate briefly/);
  });

  it("maps catalogue voices to flux models with hannah default", () => {
    expect(fluxSpeakModelForCatalogue("warm_recruiter")).toBe("flux-hannah-en");
    expect(fluxSpeakModelForCatalogue(null)).toBe("flux-hannah-en");
    expect(fluxSpeakModelForCatalogue("clear_interviewer")).toBe("flux-marcus-en");
  });

  it("is enabled by default", () => {
    expect(isDeepgramVoiceAgentEnabled()).toBe(true);
  });
});

describe("deepgramVoiceAgentSession speak handoff", () => {
  it("defaults captureMic to false (inject-only)", () => {
    const session = new DeepgramVoiceAgentSession(DEEPGRAM_MOCK_AGENT_DEFAULTS, {}, {});
    expect(session.isCapturingMic).toBe(false);
  });

  it("only enables mic when captureMic is explicitly true", () => {
    const session = new DeepgramVoiceAgentSession(DEEPGRAM_MOCK_AGENT_DEFAULTS, {}, {
      captureMic: true,
    });
    expect(session.isCapturingMic).toBe(true);
  });

  it("resolves speak only after audio done and playback drained", () => {
    expect(
      shouldResolveSpeakAfterAudioDone({ audioDone: true, playbackRemainingMs: 0 }),
    ).toBe(true);
    expect(
      shouldResolveSpeakAfterAudioDone({ audioDone: true, playbackRemainingMs: 120 }),
    ).toBe(false);
    expect(
      shouldResolveSpeakAfterAudioDone({ audioDone: false, playbackRemainingMs: 0 }),
    ).toBe(false);
  });

  it("rejects pending speak immediately on InjectionRefused", async () => {
    const session = new DeepgramVoiceAgentSession(DEEPGRAM_MOCK_AGENT_DEFAULTS);
    // Simulate SettingsApplied + open speak waiter via internal control path.
    (session as unknown as { settingsApplied: boolean }).settingsApplied = true;
    (session as unknown as { ws: { readyState: number; send: () => void } }).ws = {
      readyState: WebSocket.OPEN,
      send: () => undefined,
    };

    const speakPromise = session.speakInjected("Tell me about yourself.");
    session.handleControlMessageForTests(
      JSON.stringify({ type: "InjectionRefused", description: "Agent busy" }),
    );

    await expect(speakPromise).rejects.toThrow(/InjectionRefused|Agent busy/i);
  });
});
