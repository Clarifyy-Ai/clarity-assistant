import { describe, expect, it } from "vitest";
import {
  coerceRealProgress,
  isJobProgressTerminal,
  normalizeJobStatus,
} from "@/lib/async/jobProgress";
import {
  createAsyncOpState,
  isAsyncOpBusy,
  reduceAsyncOp,
} from "@/lib/async/asyncOpState";
import { waitBandForElapsedMs, waitMessageForElapsedMs } from "@/lib/async/waitMessaging";
import {
  documentJobChecklist,
  mapDocumentJobToProgress,
  mapPaperJobToProgress,
  paperJobChecklist,
  withUploadProgress,
} from "@/lib/async/jobAdapters";

describe("jobProgress", () => {
  it("normalizes statuses and never invents progress", () => {
    expect(normalizeJobStatus("failed_retryable")).toBe("failed");
    expect(normalizeJobStatus("ready")).toBe("completed");
    expect(coerceRealProgress(72)).toBe(72);
    expect(coerceRealProgress(101)).toBeUndefined();
    expect(coerceRealProgress("50")).toBeUndefined();
    expect(isJobProgressTerminal("completed")).toBe(true);
  });
});

describe("asyncOpState", () => {
  it("moves through named stages without percentages", () => {
    let s = createAsyncOpState();
    s = reduceAsyncOp(s, { type: "START", message: "Starting STAR…" });
    expect(isAsyncOpBusy(s.status)).toBe(true);
    s = reduceAsyncOp(s, {
      type: "STAGE",
      stage: "generating",
      message: "Generating STAR story…",
    });
    expect(s.message).toContain("STAR");
    s = reduceAsyncOp(s, { type: "COMPLETE" });
    expect(s.status).toBe("completed");
  });
});

describe("waitMessaging", () => {
  it("escalates patience copy without failing", () => {
    expect(waitBandForElapsedMs(5_000)).toBe("early");
    expect(waitBandForElapsedMs(15_000)).toBe("steady");
    expect(waitMessageForElapsedMs(35_000, "Generating…")).toMatch(/longer/i);
  });
});

describe("jobAdapters", () => {
  it("maps paper jobs to checklist stages", () => {
    const p = mapPaperJobToProgress({
      jobId: "j1",
      status: "processing",
      progressStage: "selecting_questions",
    });
    expect(p.progress).toBeUndefined();
    expect(p.message.toLowerCase()).toMatch(/select|generat/);
    const steps = paperJobChecklist("selecting_questions", "processing");
    expect(steps.some((s) => s.state === "active")).toBe(true);
  });

  it("maps document jobs and only attaches real upload %", () => {
    const p = mapDocumentJobToProgress({
      id: "d1",
      status: "extracting",
    });
    expect(p.message).toMatch(/Extracting/i);
    expect(withUploadProgress(p, 43).progress).toBe(43);
    expect(withUploadProgress(p, undefined).progress).toBeUndefined();
    const steps = documentJobChecklist("extracting");
    expect(steps.find((s) => s.id === "extracting")?.state).toBe("active");
  });
});
