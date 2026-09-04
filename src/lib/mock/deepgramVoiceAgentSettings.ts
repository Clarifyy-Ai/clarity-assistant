/**
 * Client-side Deepgram Voice Agent Settings for mock interviews.
 * Inject-only speak path: Flux Hannah reads scripted questions; MockSession owns Q/next.
 * Candidate answers use nova-3 LiveTranscription — not agent listen.
 */

export const DEEPGRAM_AGENT_WS_URL = "wss://agent.deepgram.com/v1/agent/converse";

/** Minimal think stub required by Settings — must not drive interview turns. */
export const MOCK_INJECT_ONLY_THINK_PROMPT =
  "You are a TTS voice for Career Pilot mock interviews. " +
  "Only speak text injected by the client via InjectAgentMessage. " +
  "Do not invent questions, greetings, follow-ups, or coaching. " +
  "If the user speaks, remain silent and wait for the next injected message.";

export type DeepgramAgentSettings = {
  type: "Settings";
  audio: {
    input: { encoding: string; sample_rate: number };
    output: { encoding: string; sample_rate: number; container: string };
  };
  agent: {
    language?: string;
    speak: {
      provider: { type: string; version: string; model: string };
    };
    listen: {
      provider: { type: string; version: string; model: string };
    };
    think: {
      provider: { type: string; model: string };
      prompt: string;
    };
    /** Empty string = no greeting race with Q1. */
    greeting: string;
  };
};

export const DEEPGRAM_MOCK_AGENT_DEFAULTS: DeepgramAgentSettings = {
  type: "Settings",
  audio: {
    input: {
      encoding: "linear16",
      sample_rate: 48000,
    },
    output: {
      encoding: "linear16",
      sample_rate: 24000,
      container: "none",
    },
  },
  agent: {
    language: "en",
    speak: {
      provider: {
        type: "deepgram",
        version: "v2",
        model: "flux-hannah-en",
      },
    },
    listen: {
      provider: {
        type: "deepgram",
        version: "v2",
        model: "flux-general-en",
      },
    },
    think: {
      provider: {
        type: "google",
        model: "gemini-2.5-flash",
      },
      prompt: MOCK_INJECT_ONLY_THINK_PROMPT,
    },
    greeting: "",
  },
};

export type MockAgentContext = {
  role?: string | null;
  company?: string | null;
  interviewType?: string | null;
  personalityPrompt?: string | null;
  jobDescription?: string | null;
  resumeSummary?: string | null;
};

/** Catalogue voice → Flux speak model (Hannah is the mock default). */
export function fluxSpeakModelForCatalogue(voiceId: string | null | undefined): string {
  switch (voiceId) {
    case "calm_mentor":
      return "flux-heather-en";
    case "clear_interviewer":
      return "flux-marcus-en";
    case "warm_recruiter":
      return "flux-hannah-en";
    case "technical_panelist":
      return "flux-wade-en";
    case "executive_formal":
      return "flux-bruce-en";
    case "classic_professional":
    default:
      return "flux-hannah-en";
  }
}

/**
 * Build inject-only Settings for mock interviewer speech.
 * Context is recorded in think stub for logging only — agent must not invent Qs.
 */
export function buildMockInterviewAgentSettings(
  context: MockAgentContext = {},
  opts?: { voiceId?: string | null; overrides?: Partial<DeepgramAgentSettings> },
): DeepgramAgentSettings {
  const settings: DeepgramAgentSettings = structuredClone(DEEPGRAM_MOCK_AGENT_DEFAULTS);
  settings.agent.speak.provider.model = fluxSpeakModelForCatalogue(opts?.voiceId);
  settings.agent.greeting = "";

  const contextBits: string[] = [];
  if (context.role?.trim()) contextBits.push(`Target role: ${context.role.trim()}`);
  if (context.company?.trim()) contextBits.push(`Company: ${context.company.trim()}`);
  if (context.interviewType?.trim()) {
    contextBits.push(`Interview type: ${context.interviewType.trim()}`);
  }

  if (contextBits.length > 0) {
    settings.agent.think.prompt = `${MOCK_INJECT_ONLY_THINK_PROMPT}\n\n#Session Context (do not invent questions)\n${contextBits.join("\n")}`;
  }

  if (opts?.overrides) {
    return {
      ...settings,
      ...opts.overrides,
      audio: { ...settings.audio, ...(opts.overrides.audio ?? {}) },
      agent: {
        ...settings.agent,
        ...(opts.overrides.agent ?? {}),
        greeting: opts.overrides.agent?.greeting ?? "",
      },
    };
  }

  return settings;
}

/** Opt-in Voice Agent for mock interviews (default on unless explicitly disabled). */
export function isDeepgramVoiceAgentEnabled(): boolean {
  try {
    const raw = String(import.meta.env.VITE_ENABLE_DEEPGRAM_VOICE_AGENT ?? "true")
      .trim()
      .toLowerCase();
    return !(raw === "0" || raw === "false" || raw === "no");
  } catch {
    return true;
  }
}
