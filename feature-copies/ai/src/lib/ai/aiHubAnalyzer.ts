import type { AIHubTaskType } from "./aiHubRegistry";
import { AI_HUB_ROUTING_DEFAULTS, getHubModel } from "./aiHubRegistry";

export interface RoutingDecision {
  taskType: AIHubTaskType;
  provider: "openai" | "gemini" | "anthropic";
  model: string;
  reason: string;
  confidenceTier: "high" | "medium" | "low";
  fallbackChain: string[];
  maxOutputTokensDefault: number;
}

export interface AnalyzeInput {
  prompt: string;
  systemPrompt?: string;
  taskHint?: string;
  priority?: "low" | "normal" | "high";
}

const HINT_MAP: Record<string, AIHubTaskType> = {
  "gap-analysis": "extract_json",
  "mock-interview-feedback": "reasoning",
  "prep-star": "long_form",
  "prep-rephrase": "short_qa",
  summarize: "summarize",
  code: "code",
  json: "extract_json",
};

/**
 * Cheap local classifier — no extra model call.
 */
export function classifyTask(input: AnalyzeInput): {
  taskType: AIHubTaskType;
  confidence: "high" | "medium" | "low";
  reason: string;
} {
  const hint = (input.taskHint ?? "").trim().toLowerCase();
  if (hint && HINT_MAP[hint]) {
    return {
      taskType: HINT_MAP[hint],
      confidence: "high",
      reason: `Caller taskHint=${hint}`,
    };
  }

  const text = `${input.systemPrompt ?? ""}\n${input.prompt}`.toLowerCase();
  const len = text.length;

  if (
    text.includes("```") ||
    text.includes("typescript") ||
    text.includes("python") ||
    /\bfunction\b|\bclass\b|\bdef\b/.test(text)
  ) {
    return { taskType: "code", confidence: "high", reason: "Code signals detected" };
  }

  if (
    text.includes("json") ||
    text.includes("schema") ||
    text.includes("extract") ||
    text.includes("structured")
  ) {
    return {
      taskType: "extract_json",
      confidence: "medium",
      reason: "Structured/JSON extraction signals",
    };
  }

  if (text.includes("summarize") || text.includes("summary") || text.includes("tl;dr")) {
    return { taskType: "summarize", confidence: "high", reason: "Summarization keywords" };
  }

  if (
    text.includes("reason") ||
    text.includes("step by step") ||
    text.includes("analyze") ||
    text.includes("architecture") ||
    len > 4000
  ) {
    return {
      taskType: "reasoning",
      confidence: len > 4000 ? "medium" : "low",
      reason: len > 4000 ? "Long prompt → reasoning tier" : "Reasoning keywords",
    };
  }

  if (len > 1500) {
    return {
      taskType: "long_form",
      confidence: "medium",
      reason: "Medium-long prompt",
    };
  }

  return {
    taskType: "short_qa",
    confidence: "high",
    reason: "Default short Q&A",
  };
}

export function decideRoute(input: AnalyzeInput): RoutingDecision {
  const classified = classifyTask(input);
  const rule =
    AI_HUB_ROUTING_DEFAULTS.find((r) => r.taskType === classified.taskType) ??
    AI_HUB_ROUTING_DEFAULTS[0];

  const model = getHubModel(rule.preferredModel);
  const provider = model?.provider ?? rule.preferredProvider;

  return {
    taskType: classified.taskType,
    provider,
    model: rule.preferredModel,
    reason: `${classified.reason}; policy prefers ${rule.preferredModel}`,
    confidenceTier: classified.confidence,
    fallbackChain: rule.fallbackChain.filter((id) => Boolean(getHubModel(id))),
    maxOutputTokensDefault: rule.maxOutputTokensDefault,
  };
}
