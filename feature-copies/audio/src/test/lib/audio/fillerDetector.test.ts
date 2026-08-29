// Filler word detection — covers Audio/Analytics P1 items
import { describe, it, expect } from "vitest";
import {
  detectFillersInText,
  FillerAccumulator,
  FillerDetector,
  RealTimeFillerCounter,
  buildFillerSummary,
} from "@/lib/audio/fillerDetector";

describe("detectFillersInText", () => {
  it("finds 'um' and 'uh'", () => {
    const r = detectFillersInText("um well, uh I think");
    const words = r.map((x) => x.word);
    expect(words).toContain("um");
    expect(words).toContain("uh");
  });
  it("counts repeated occurrences", () => {
    const r = detectFillersInText("um um um");
    expect(r.find((x) => x.word === "um")?.count).toBe(3);
  });
  it("does not flag 'like to' (transitive)", () => {
    const r = detectFillersInText("I would like to learn");
    expect(r.find((x) => x.word === "like")).toBeUndefined();
  });
  it("flags filler 'like'", () => {
    const r = detectFillersInText("it was like really hard");
    expect(r.find((x) => x.word === "like")?.count).toBeGreaterThan(0);
  });
  it("returns empty for clean text", () => {
    expect(detectFillersInText("This is a clear answer.")).toEqual([]);
  });
});

describe("FillerAccumulator", () => {
  it("accumulates totals across calls", () => {
    const acc = new FillerAccumulator();
    acc.processText("um um");
    acc.processText("uh basically");
    expect(acc.getTotal()).toBe(4);
  });
  it("getTopFiller returns most common", () => {
    const acc = new FillerAccumulator();
    acc.processText("um um um uh");
    expect(acc.getTopFiller()).toBe("um");
  });
  it("reset clears state", () => {
    const acc = new FillerAccumulator();
    acc.processText("um um");
    acc.reset();
    expect(acc.getTotal()).toBe(0);
    expect(acc.getTopFiller()).toBeNull();
  });
  it("getFillerRate computes per-minute", () => {
    const acc = new FillerAccumulator();
    acc.processText("um um um um"); // 4 fillers
    expect(acc.getFillerRate(120)).toBe(2); // 4/120*60 = 2/min
  });
  it("returns 0 rate at zero duration", () => {
    const acc = new FillerAccumulator();
    acc.processText("um");
    expect(acc.getFillerRate(0)).toBe(0);
  });
});

describe("RealTimeFillerCounter", () => {
  it("invokes callback on new fillers", () => {
    let last = 0;
    const c = new RealTimeFillerCounter((n) => (last = n));
    c.check("um well");
    expect(c.getCount()).toBeGreaterThan(0);
    expect(last).toBe(c.getCount());
  });
  it("does not call back when no fillers", () => {
    let calls = 0;
    const c = new RealTimeFillerCounter(() => calls++);
    c.check("a clean sentence");
    expect(calls).toBe(0);
  });
});

describe("buildFillerSummary grading", () => {
  it("excellent at 0", () => {
    expect(buildFillerSummary([], 60).grade).toBe("excellent");
  });
  it("good under 2/min", () => {
    const r = buildFillerSummary(
      [{ word: "um", count: 1, timestamps: [10] }],
      60,
    );
    expect(r.grade).toBe("good");
  });
  it("poor at high rate", () => {
    const r = buildFillerSummary(
      [{ word: "um", count: 20, timestamps: [] }],
      60,
    );
    expect(r.grade).toBe("poor");
  });
});

describe("FillerDetector wrapper", () => {
  it("getCount + getExamples work end to end", () => {
    const d = new FillerDetector();
    d.processText("um um basically");
    expect(d.getCount()).toBe(3);
    const ex = d.getExamples(2);
    expect(ex.length).toBeGreaterThan(0);
  });
});
