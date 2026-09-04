/**
 * Default Deepgram Voice Agent settings for mock interviews (inject-only speak).
 * Speak: flux-hannah-en · no greeting · think stub must not invent questions.
 * Override via DEEPGRAM_AGENT_SETTINGS_JSON Edge secret.
 */

export const MOCK_INJECT_ONLY_THINK_PROMPT =
  "You are a TTS voice for Career Pilot mock interviews. " +
  "Only speak text injected by the client via InjectAgentMessage. " +
  "Do not invent questions, greetings, follow-ups, or coaching. " +
  "If the user speaks, remain silent and wait for the next injected message.";

export const DEEPGRAM_AGENT_DEFAULTS = {
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
} as const;

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
    greeting: string;
  };
};

export function loadDeepgramAgentSettings(): DeepgramAgentSettings {
  const raw = (Deno.env.get("DEEPGRAM_AGENT_SETTINGS_JSON") ?? "").trim();
  if (!raw) {
    return JSON.parse(JSON.stringify(DEEPGRAM_AGENT_DEFAULTS)) as DeepgramAgentSettings;
  }
  try {
    const parsed = JSON.parse(raw) as DeepgramAgentSettings;
    if (!parsed || parsed.type !== "Settings") {
      throw new Error("missing Settings type");
    }
    return parsed;
  } catch {
    console.warn("[deepgramAgentDefaults] Invalid DEEPGRAM_AGENT_SETTINGS_JSON; using defaults");
    return JSON.parse(JSON.stringify(DEEPGRAM_AGENT_DEFAULTS)) as DeepgramAgentSettings;
  }
}

/** Optional model overrides from secrets (when full JSON is not set). */
export function resolveDeepgramAgentSettings(): DeepgramAgentSettings {
  const base = loadDeepgramAgentSettings();
  // Inject-only product default: never greet on connect (avoids Q1 race).
  if (typeof base.agent.greeting !== "string") base.agent.greeting = "";
  const speak = (Deno.env.get("DEEPGRAM_AGENT_SPEAK_MODEL") ?? "").trim();
  const listen = (Deno.env.get("DEEPGRAM_AGENT_LISTEN_MODEL") ?? "").trim();
  if (speak) {
    base.agent.speak.provider.model = speak;
  }
  if (listen) {
    base.agent.listen.provider.model = listen;
  }
  return base;
}
