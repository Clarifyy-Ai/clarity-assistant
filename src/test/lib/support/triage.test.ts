import { describe, expect, it } from "vitest";
import {
  compareSupportPriority,
  escalationUserMessage,
  inferPriority,
  mergeEscalationState,
  nextEscalationStateAfterBotReply,
  parseEscalationState,
  shouldAutoEscalate,
  waitingStatusLabel,
} from "@/lib/support/triage";

describe("support triage", () => {
  describe("shouldAutoEscalate", () => {
    it("escalates on explicit Talk to Support", () => {
      const r = shouldAutoEscalate({
        message: "Talk to Support",
        intent: "escalate",
        category: "general",
        state: {},
      });
      expect(r.escalate).toBe(true);
      expect(r.reason).toBe("user_requested_agent");
      expect(r.priority).toBe("normal");
    });

    it("escalates payment urgent with urgent priority", () => {
      const r = shouldAutoEscalate({
        message: "I was charged but credits not received",
        intent: "payment",
        category: "billing",
        state: {},
      });
      expect(r.escalate).toBe(true);
      expect(r.reason).toBe("payment_urgent");
      expect(r.priority).toBe("urgent");
    });

    it("escalates stuck job after bot replied about exam_job", () => {
      const r = shouldAutoEscalate({
        message: "Still stuck and not working",
        intent: "exam_job",
        category: "gov_exams",
        state: { last_bot_intent: "exam_job", last_bot_at: new Date().toISOString() },
      });
      expect(r.escalate).toBe(true);
      expect(r.reason).toBe("stuck_after_bot");
      expect(r.priority).toBe("high");
    });

    it("escalates after 2+ unresolved AI turns", () => {
      const r = shouldAutoEscalate({
        message: "I still don't understand how this works",
        intent: "unclear",
        category: "general",
        state: { ai_unresolved_turns: 2 },
      });
      expect(r.escalate).toBe(true);
      expect(r.reason).toBe("ai_unresolved");
      expect(r.priority).toBe("normal");
    });

    it("assigns low priority for vague messages after AI failures", () => {
      const r = shouldAutoEscalate({
        message: "help",
        intent: "unclear",
        category: "general",
        state: { ai_unresolved_turns: 2 },
      });
      expect(r.escalate).toBe(true);
      expect(r.reason).toBe("ai_unresolved");
      expect(r.priority).toBe("low");
    });

    it("does not auto-escalate routine questions", () => {
      const r = shouldAutoEscalate({
        message: "How many credits do I have?",
        intent: "credits",
        category: "billing",
        state: {},
      });
      expect(r.escalate).toBe(false);
      expect(r.priority).toBe("normal");
    });
  });

  describe("inferPriority", () => {
    it("marks payment urgent language as urgent", () => {
      expect(inferPriority("I need a refund ASAP", "payment", "payment_urgent")).toBe("urgent");
    });

    it("marks stuck-after-bot as high", () => {
      expect(inferPriority("still stuck", "exam_job", "stuck_after_bot")).toBe("high");
    });
  });

  describe("escalationUserMessage", () => {
    it("includes ticket ref for urgent incidents", () => {
      const msg = escalationUserMessage("urgent", "CP-ABC123");
      expect(msg).toContain("CP-ABC123");
      expect(msg).toMatch(/urgent|as soon as possible/i);
    });

    it("uses queued copy for low priority", () => {
      const msg = escalationUserMessage("low", "CP-LOW1");
      expect(msg).toContain("queue");
      expect(msg).toContain("CP-LOW1");
    });
  });

  describe("waitingStatusLabel", () => {
    it("shows urgent label", () => {
      expect(waitingStatusLabel("urgent")).toBe("Urgent — agent assigned soon");
    });

    it("shows low-priority queued label", () => {
      expect(waitingStatusLabel("low")).toBe("Queued — agent will reply when available");
    });
  });

  describe("escalation state helpers", () => {
    it("parses and merges escalation state in context_snapshot", () => {
      const snapshot = mergeEscalationState(null, { ai_unresolved_turns: 1 });
      const parsed = parseEscalationState(snapshot);
      expect(parsed.ai_unresolved_turns).toBe(1);
    });

    it("resets AI turns after deterministic bot reply", () => {
      const next = nextEscalationStateAfterBotReply({
        intent: "credits",
        usedAi: false,
        previous: { ai_unresolved_turns: 2 },
      });
      expect(next.ai_unresolved_turns).toBe(0);
      expect(next.last_bot_intent).toBe("credits");
    });

    it("increments AI turns on unclear + AI", () => {
      const next = nextEscalationStateAfterBotReply({
        intent: "unclear",
        usedAi: true,
        previous: { ai_unresolved_turns: 1 },
      });
      expect(next.ai_unresolved_turns).toBe(2);
    });
  });

  describe("compareSupportPriority", () => {
    it("orders urgent before normal", () => {
      expect(compareSupportPriority("urgent", "normal")).toBeLessThan(0);
      expect(compareSupportPriority("low", "high")).toBeGreaterThan(0);
    });
  });
});
