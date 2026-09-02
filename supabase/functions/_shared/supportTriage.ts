/** Deno copy of src/lib/support/triage.ts — keep in sync. */

import type { SupportCategory, SupportIntent } from "./supportClassify.ts";

export type SupportPriority = "low" | "normal" | "high" | "urgent";

export type SupportEscalationState = {
  last_bot_intent?: SupportIntent | null;
  last_bot_at?: string | null;
  ai_unresolved_turns?: number;
  deterministic_stuck_turns?: number;
};

export type AutoEscalateReason =
  | "user_requested_agent"
  | "payment_urgent"
  | "stuck_after_bot"
  | "ai_unresolved";

export type ShouldAutoEscalateInput = {
  message: string;
  intent: SupportIntent;
  category: SupportCategory;
  escalateRequested?: boolean;
  state: SupportEscalationState;
};

export type ShouldAutoEscalateResult = {
  escalate: boolean;
  reason?: AutoEscalateReason;
  priority: SupportPriority;
};

const PAYMENT_URGENT_RE =
  /\b(charged|not received|didn'?t receive|refund|urgent|asap|immediately|money deducted)\b/i;
const STUCK_RE = /\b(stuck|failed|still|not working|won'?t open|hang|hanging|timeout)\b/i;
const VAGUE_RE = /^(help|hi|hello|ok|yes|no|thanks|thank you|still)$/i;

export function parseEscalationState(
  snapshot: Record<string, unknown> | null | undefined,
): SupportEscalationState {
  const raw = snapshot?.escalation;
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    last_bot_intent: typeof o.last_bot_intent === "string" ? (o.last_bot_intent as SupportIntent) : null,
    last_bot_at: typeof o.last_bot_at === "string" ? o.last_bot_at : null,
    ai_unresolved_turns:
      typeof o.ai_unresolved_turns === "number" ? o.ai_unresolved_turns : 0,
    deterministic_stuck_turns:
      typeof o.deterministic_stuck_turns === "number" ? o.deterministic_stuck_turns : 0,
  };
}

export function mergeEscalationState(
  snapshot: Record<string, unknown> | null | undefined,
  patch: Partial<SupportEscalationState>,
): Record<string, unknown> {
  const base = snapshot && typeof snapshot === "object" ? { ...snapshot } : {};
  const current = parseEscalationState(base);
  return {
    ...base,
    escalation: { ...current, ...patch },
  };
}

export function inferPriority(
  message: string,
  intent: SupportIntent,
  reason?: AutoEscalateReason,
): SupportPriority {
  if (reason === "payment_urgent" || (intent === "payment" && PAYMENT_URGENT_RE.test(message))) {
    return "urgent";
  }
  if (reason === "stuck_after_bot") return "high";
  if (reason === "user_requested_agent") return "normal";
  if (reason === "ai_unresolved") {
    return message.trim().length < 20 || VAGUE_RE.test(message.trim()) ? "low" : "normal";
  }
  if (intent === "payment") return "high";
  if (intent === "exam_job" || intent === "document_job") return "high";
  return "normal";
}

export function shouldAutoEscalate(input: ShouldAutoEscalateInput): ShouldAutoEscalateResult {
  const message = (input.message ?? "").trim();
  const state = input.state ?? {};
  const aiTurns = state.ai_unresolved_turns ?? 0;

  if (input.escalateRequested || input.intent === "escalate") {
    return {
      escalate: true,
      reason: "user_requested_agent",
      priority: inferPriority(message, input.intent, "user_requested_agent"),
    };
  }

  if (input.intent === "payment" && PAYMENT_URGENT_RE.test(message)) {
    return {
      escalate: true,
      reason: "payment_urgent",
      priority: "urgent",
    };
  }

  const lastIntent = state.last_bot_intent;
  if (
    lastIntent &&
    (lastIntent === "exam_job" || lastIntent === "document_job") &&
    STUCK_RE.test(message)
  ) {
    return {
      escalate: true,
      reason: "stuck_after_bot",
      priority: "high",
    };
  }

  if (input.intent === "unclear" && aiTurns >= 2) {
    return {
      escalate: true,
      reason: "ai_unresolved",
      priority: inferPriority(message, input.intent, "ai_unresolved"),
    };
  }

  return { escalate: false, priority: "normal" };
}

export function escalationUserMessage(
  priority: SupportPriority,
  publicRef: string | null | undefined,
): string {
  const ticket = publicRef ? ` Ticket ${publicRef}.` : "";
  switch (priority) {
    case "urgent":
      return `This looks urgent — we're assigning a support agent as soon as possible.${ticket} Your chat is saved here; you don't need to repeat yourself.`;
    case "high":
      return `We're prioritizing your request and assigning a support agent.${ticket} Your conversation is saved — an agent will reply here (usually within a few hours, IST business hours).`;
    case "low":
      return `Your request is in our queue.${ticket} An agent will reply when available. Your chat is saved — you can leave this open and come back.`;
    default:
      return `We're assigning this to a support agent.${ticket} Your chat is saved and an agent will reply here when available (typically within a few hours, IST business hours).`;
  }
}

export function nextEscalationStateAfterBotReply(opts: {
  intent: SupportIntent;
  usedAi: boolean;
  previous: SupportEscalationState;
}): SupportEscalationState {
  const now = new Date().toISOString();
  const deterministicIntents: SupportIntent[] = [
    "credits",
    "payment",
    "exam_job",
    "document_job",
    "account_howto",
    "faq",
  ];

  if (deterministicIntents.includes(opts.intent)) {
    return {
      last_bot_intent: opts.intent,
      last_bot_at: now,
      ai_unresolved_turns: 0,
      deterministic_stuck_turns: 0,
    };
  }

  if (opts.usedAi && opts.intent === "unclear") {
    return {
      last_bot_intent: opts.intent,
      last_bot_at: now,
      ai_unresolved_turns: (opts.previous.ai_unresolved_turns ?? 0) + 1,
      deterministic_stuck_turns: opts.previous.deterministic_stuck_turns ?? 0,
    };
  }

  return {
    last_bot_intent: opts.intent,
    last_bot_at: now,
    ai_unresolved_turns: opts.usedAi ? (opts.previous.ai_unresolved_turns ?? 0) + 1 : 0,
    deterministic_stuck_turns: opts.previous.deterministic_stuck_turns ?? 0,
  };
}
