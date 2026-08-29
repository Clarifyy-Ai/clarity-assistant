import { describe, expect, it } from "vitest";
import { splitMarkdownSections } from "@/lib/prep/structuredOutput";

describe("splitMarkdownSections", () => {
  it("splits on ## and ### markdown headings", () => {
    const text = [
      "## Design URL Shortener",
      "",
      "### 1. Requirements",
      "- Functional: shorten and redirect",
      "- Non-functional: low latency",
      "",
      "### 2. High-Level Architecture",
      "API, hash service, datastore",
    ].join("\n");

    expect(splitMarkdownSections(text)).toEqual([
      { title: "Requirements", body: "- Functional: shorten and redirect\n- Non-functional: low latency" },
      { title: "High-Level Architecture", body: "API, hash service, datastore" },
    ]);
  });

  it("splits on numbered headings like 1. Requirements", () => {
    const text = [
      "1. Requirements",
      "Estimate QPS and storage.",
      "",
      "2. High-Level Architecture",
      "Client → API → DB",
      "",
      "3. Scaling & Tradeoffs",
      "Cache hot keys; accept eventual consistency.",
    ].join("\n");

    expect(splitMarkdownSections(text)).toEqual([
      { title: "Requirements", body: "Estimate QPS and storage." },
      { title: "High-Level Architecture", body: "Client → API → DB" },
      { title: "Scaling & Tradeoffs", body: "Cache hot keys; accept eventual consistency." },
    ]);
  });

  it("falls back to a single Breakdown section when there are no headings", () => {
    const blob = "Sketch the data flow and call out caching. No section titles here.";
    expect(splitMarkdownSections(blob)).toEqual([
      { title: "Breakdown", body: blob },
    ]);
    expect(splitMarkdownSections("   ")).toEqual([{ title: "Breakdown", body: "" }]);
  });
});
