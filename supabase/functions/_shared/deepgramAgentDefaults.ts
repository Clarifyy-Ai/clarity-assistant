/**
 * Default Deepgram Voice Agent settings (v2 flux listen/speak + Google think).
 * Override via DEEPGRAM_AGENT_SETTINGS_JSON Edge secret when wiring voice agents.
 */
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
    speak: {
      provider: {
        type: "deepgram",
        version: "v2",
        model: "flux-kit-en",
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
        model: "gemini-3.1-flash-lite",
      },
      prompt:
        "You are a helpful interview practice assistant. Be concise, warm, and professional.",
    },
    greeting: "Hello! How may I help you?",
  },
} as const;

export function loadDeepgramAgentSettings(): typeof DEEPGRAM_AGENT_DEFAULTS {
  const raw = (Deno.env.get("DEEPGRAM_AGENT_SETTINGS_JSON") ?? "").trim();
  if (!raw) return DEEPGRAM_AGENT_DEFAULTS;
  try {
    return JSON.parse(raw) as typeof DEEPGRAM_AGENT_DEFAULTS;
  } catch {
    console.warn("[deepgramAgentDefaults] Invalid DEEPGRAM_AGENT_SETTINGS_JSON; using defaults");
    return DEEPGRAM_AGENT_DEFAULTS;
  }
}
