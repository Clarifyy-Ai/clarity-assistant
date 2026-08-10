// Shared AI Hub model registry + routing defaults (edge + mirrored concepts on client).
// Official provider model IDs only — do not invent IDs.

export type AIHubProvider = "openai" | "gemini" | "anthropic";
export type AIHubModelTier = "cheap" | "standard" | "premium";
export type AIHubTaskType =
  | "short_qa"
  | "summarize"
  | "extract_json"
  | "long_form"
  | "code"
  | "reasoning";

export interface AIHubModelInfo {
  id: string;
  provider: AIHubProvider;
  displayName: string;
  /** Integer micro-USD per 1M input tokens ($1 = 1_000_000). */
  inputPricePerMillionMicroUsd: number;
  outputPricePerMillionMicroUsd: number;
  maxOutputTokens: number;
  capabilities: string[];
  enabled: boolean;
  tier: AIHubModelTier;
  freeTierEligible: boolean;
}

export interface AIHubRoutingRule {
  taskType: AIHubTaskType;
  preferredProvider: AIHubProvider;
  preferredModel: string;
  fallbackChain: string[];
  maxOutputTokensDefault: number;
}

/** Prices as micro-USD per million tokens (approximate public list prices). */
export const AI_HUB_MODELS: AIHubModelInfo[] = [
  {
    id: "gemini-2.5-flash",
    provider: "gemini",
    displayName: "Gemini 2.5 Flash",
    inputPricePerMillionMicroUsd: 100_000, // $0.10
    outputPricePerMillionMicroUsd: 400_000, // $0.40
    maxOutputTokens: 8192,
    capabilities: ["text", "json"],
    enabled: true,
    tier: "cheap",
    freeTierEligible: true,
  },
  {
    id: "gemini-2.0-flash",
    provider: "gemini",
    displayName: "Gemini 2.0 Flash",
    inputPricePerMillionMicroUsd: 100_000,
    outputPricePerMillionMicroUsd: 400_000,
    maxOutputTokens: 8192,
    capabilities: ["text", "json"],
    enabled: true,
    tier: "cheap",
    freeTierEligible: true,
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    displayName: "GPT-4o mini",
    inputPricePerMillionMicroUsd: 150_000,
    outputPricePerMillionMicroUsd: 600_000,
    maxOutputTokens: 16384,
    capabilities: ["text", "json", "code"],
    enabled: true,
    tier: "cheap",
    freeTierEligible: true,
  },
  {
    id: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    inputPricePerMillionMicroUsd: 2_500_000,
    outputPricePerMillionMicroUsd: 10_000_000,
    maxOutputTokens: 16384,
    capabilities: ["text", "json", "code", "reasoning"],
    enabled: true,
    tier: "premium",
    freeTierEligible: false,
  },
  {
    id: "claude-3-haiku-20240307",
    provider: "anthropic",
    displayName: "Claude 3 Haiku",
    inputPricePerMillionMicroUsd: 250_000,
    outputPricePerMillionMicroUsd: 1_250_000,
    maxOutputTokens: 4096,
    capabilities: ["text", "json"],
    enabled: true,
    tier: "cheap",
    freeTierEligible: true,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    displayName: "Claude 3.5 Sonnet",
    inputPricePerMillionMicroUsd: 3_000_000,
    outputPricePerMillionMicroUsd: 15_000_000,
    maxOutputTokens: 8192,
    capabilities: ["text", "json", "code", "reasoning"],
    enabled: true,
    tier: "premium",
    freeTierEligible: false,
  },
];

export const AI_HUB_ROUTING_DEFAULTS: AIHubRoutingRule[] = [
  {
    taskType: "short_qa",
    preferredProvider: "gemini",
    preferredModel: "gemini-2.5-flash",
    fallbackChain: ["gemini-2.5-flash", "gpt-4o-mini", "claude-3-haiku-20240307"],
    maxOutputTokensDefault: 500,
  },
  {
    taskType: "summarize",
    preferredProvider: "gemini",
    preferredModel: "gemini-2.5-flash",
    fallbackChain: ["gemini-2.5-flash", "gpt-4o-mini"],
    maxOutputTokensDefault: 1000,
  },
  {
    taskType: "extract_json",
    preferredProvider: "gemini",
    preferredModel: "gemini-2.5-flash",
    fallbackChain: ["gemini-2.5-flash", "gpt-4o-mini"],
    maxOutputTokensDefault: 1500,
  },
  {
    taskType: "long_form",
    preferredProvider: "openai",
    preferredModel: "gpt-4o-mini",
    fallbackChain: ["gpt-4o-mini", "gemini-2.5-flash", "claude-3-5-sonnet-20241022"],
    maxOutputTokensDefault: 2000,
  },
  {
    taskType: "code",
    preferredProvider: "openai",
    preferredModel: "gpt-4o-mini",
    fallbackChain: ["gpt-4o-mini", "claude-3-5-sonnet-20241022"],
    maxOutputTokensDefault: 2000,
  },
  {
    taskType: "reasoning",
    preferredProvider: "anthropic",
    preferredModel: "claude-3-5-sonnet-20241022",
    fallbackChain: ["claude-3-5-sonnet-20241022", "gpt-4o", "gemini-2.5-flash"],
    maxOutputTokensDefault: 3000,
  },
];

export const AI_HUB_MODE_OUTPUT_CAPS = {
  quick: 500,
  normal: 2000,
  deep: 5000,
  benchmark: 2000,
  routed: 2000,
} as const;

export function getHubModel(id: string): AIHubModelInfo | undefined {
  return AI_HUB_MODELS.find((m) => m.id === id && m.enabled);
}

export function estimateCostMicroUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const model = getHubModel(modelId);
  if (!model) return 0;
  const inCost =
    (inputTokens / 1_000_000) * model.inputPricePerMillionMicroUsd;
  const outCost =
    (outputTokens / 1_000_000) * model.outputPricePerMillionMicroUsd;
  return Math.round(inCost + outCost);
}

export function estimateInputTokens(text: string): number {
  // Rough heuristic — labeled as Estimated in UI
  return Math.max(1, Math.ceil(text.length / 4));
}

export function microUsdToDisplay(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}
