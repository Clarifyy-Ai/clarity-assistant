import type { PreferredAIModel } from "@/types/user.types";

export interface ModelOption {
  value: PreferredAIModel;
  label: string;
  desc: string;
  badge: string;
  free: boolean;
}

/** Canonical model list for Settings + onboarding. */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    value: "gemini-flash",
    label: "Gemini Flash",
    desc: "Fastest responses — best for live practice and quick hints.",
    badge: "Recommended",
    free: true,
  },
  {
    value: "gemini-pro",
    label: "Gemini Pro",
    desc: "Deeper reasoning for system design and complex behavioural answers.",
    badge: "Balanced",
    free: true,
  },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    desc: "OpenAI flagship — strong reasoning and structured answers.",
    badge: "Pro",
    free: false,
  },
  {
    value: "gpt-4o-mini",
    label: "GPT-4o Mini",
    desc: "Lower latency OpenAI model with solid quality.",
    badge: "Pro",
    free: false,
  },
  {
    value: "claude-3-5-sonnet",
    label: "Claude 3.5 Sonnet",
    desc: "Anthropic model tuned for nuanced system design answers.",
    badge: "Pro",
    free: false,
  },
];

/** Normalize legacy profile values to current app slugs. */
export function normalizePreferredModel(raw: string | null | undefined): PreferredAIModel {
  const map: Record<string, PreferredAIModel> = {
    "gemini-1-5-flash": "gemini-flash",
    "gemini-2.0-flash": "gemini-flash",
    "gemini-1-5-pro": "gemini-pro",
    claude: "claude-3-5-sonnet",
  };
  if (!raw) return "gemini-flash";
  return map[raw] ?? (raw as PreferredAIModel);
}

/** Map UI model slugs to public.ai_model enum values for PostgREST writes. */
export function toDbPreferredModel(
  raw: string | null | undefined,
):
  | "gpt-4o"
  | "gpt-4o-mini"
  | "claude-3-5-sonnet"
  | "claude-3-haiku"
  | "gemini-1-5-pro"
  | "gemini-1-5-flash"
  | "gemini-2.0-flash" {
  const slug = normalizePreferredModel(raw);
  const map: Record<string, ReturnType<typeof toDbPreferredModel>> = {
    "gemini-flash": "gemini-1-5-flash",
    "gemini-pro": "gemini-1-5-pro",
    claude: "claude-3-5-sonnet",
    "claude-3-5-sonnet": "claude-3-5-sonnet",
    "claude-3-haiku": "claude-3-haiku",
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "gemini-1-5-flash": "gemini-1-5-flash",
    "gemini-1-5-pro": "gemini-1-5-pro",
    "gemini-2.0-flash": "gemini-2.0-flash",
  };
  return map[slug] ?? "gemini-1-5-flash";
}
