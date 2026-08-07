import type { PreferredAIModel } from "@/types/user.types";
import { normalizeToDisplayTier } from "@/lib/constants/pricing";
import type { PlanId } from "@/lib/billing/subscriptionManager";

export interface ModelOption {
  value: PreferredAIModel;
  label: string;
  desc: string;
  badge: string;
  free: boolean;
}

/** Canonical model list for Settings, onboarding, overlay, and session setup. */
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

const FREE_FALLBACK_MODEL: PreferredAIModel = "gemini-flash";

/** Normalize legacy profile values to current app slugs. */
export function normalizePreferredModel(raw: string | null | undefined): PreferredAIModel {
  const map: Record<string, PreferredAIModel> = {
    "gemini-1-5-flash": "gemini-flash",
    "gemini-2.0-flash": "gemini-flash",
    "gemini-1-5-pro": "gemini-pro",
    "gemini-1.5-pro": "gemini-pro",
    claude: "claude-3-5-sonnet",
  };
  if (!raw) return FREE_FALLBACK_MODEL;
  return map[raw] ?? (raw as PreferredAIModel);
}

/** True when plan unlocks GPT/Claude (matches Settings → AI Models). */
export function hasProModelAccess(planId: PlanId | string | null | undefined): boolean {
  return normalizeToDisplayTier(planId) !== "free";
}

export function isFreeModel(model: PreferredAIModel | string | null | undefined): boolean {
  const slug = normalizePreferredModel(model);
  const option = MODEL_OPTIONS.find((m) => m.value === slug);
  if (option) return option.free;
  // Unknown / legacy Gemini aliases stay free; OpenAI/Anthropic stay Pro.
  return slug.startsWith("gemini");
}

export function isModelAvailableForPlan(
  model: PreferredAIModel | string | null | undefined,
  planId: PlanId | string | null | undefined,
): boolean {
  if (hasProModelAccess(planId)) return true;
  return isFreeModel(model);
}

/** Clamp a preferred model to what the plan allows. */
export function clampPreferredModel(
  model: PreferredAIModel | string | null | undefined,
  planId: PlanId | string | null | undefined,
): PreferredAIModel {
  const slug = normalizePreferredModel(model);
  return isModelAvailableForPlan(slug, planId) ? slug : FREE_FALLBACK_MODEL;
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
