import { describe, expect, it } from "vitest";
import { classifySupportRequest } from "@/lib/support/classify";

describe("classifySupportRequest", () => {
  it("reads credits from owned profile language without AI", () => {
    const r = classifySupportRequest({ message: "How many credits do I have left on my plan?" });
    expect(r.intent).toBe("credits");
    expect(r.category).toBe("billing");
    expect(r.useAi).toBe(false);
  });

  it("routes a stuck paper to the generation job, not AI", () => {
    const r = classifySupportRequest({
      message: "My government exam paper is stuck generating",
    });
    expect(r.intent).toBe("exam_job");
    expect(r.category).toBe("gov_exams");
    expect(r.useAi).toBe(false);
  });

  it("uses job_id hint as exam_job without AI", () => {
    const r = classifySupportRequest({
      message: "this is taking forever",
      resourceHint: { job_id: "abc" },
    });
    expect(r.intent).toBe("exam_job");
    expect(r.useAi).toBe(false);
  });

  it("routes missing credits after payment to payment records", () => {
    const r = classifySupportRequest({
      message: "I paid but credits not received",
    });
    expect(r.intent).toBe("payment");
    expect(r.useAi).toBe(false);
  });

  it("escalates Talk to Support without AI", () => {
    const r = classifySupportRequest({
      message: "Talk to Support",
      escalateRequested: true,
    });
    expect(r.intent).toBe("escalate");
    expect(r.useAi).toBe(false);
  });

  it("uses AI only when the user asks why/how to improve", () => {
    const r = classifySupportRequest({
      message: "Why is my interview score so low and how can I improve?",
    });
    expect(r.intent).toBe("interview_reason");
    expect(r.useAi).toBe(true);
  });

  it("does not treat an empty open (no message) as an AI classify call", () => {
    const r = classifySupportRequest({ message: "", category: "billing" });
    expect(r.useAi).toBe(false);
    expect(r.intent).toBe("credits");
  });
});
