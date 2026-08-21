import { describe, it, expect } from "vitest";
import { formatParsedResumeForAI, normalizeParsedResume, parseResumeContentString } from "@/lib/documents/resumeParse";

describe("parseResumeContentString", () => {
  it("parses JSON resume payloads", () => {
    const parsed = parseResumeContentString(
      JSON.stringify({ full_name: "Gopi", skills: ["TypeScript"], summary: "FE engineer" }),
    );
    expect(parsed?.full_name).toBe("Gopi");
    expect(parsed?.skills).toContain("TypeScript");
  });

  it("treats plain text as a summary so AI still has context", () => {
    const parsed = parseResumeContentString(
      "Software engineer with 6 years building React and TypeScript products.",
    );
    expect(parsed?.summary).toMatch(/React and TypeScript/);
  });

  it("ignores stored parse-error payloads", () => {
    expect(
      parseResumeContentString(JSON.stringify({ _parse_error: "timeout" })),
    ).toBeNull();
  });

  it("normalizes malformed provider fields without crashing consumers", () => {
    const parsed = normalizeParsedResume({
      name: "  Jane   Doe ",
      skills: ["React", null, 42],
      experience: [null, "bad", { title: "Engineer", company: "Acme", impact_bullets: "not-an-array" }],
      projects: [null, { name: "Launch" }],
      total_years_experience: 999,
    });

    expect(parsed?.full_name).toBe("Jane Doe");
    expect(parsed?.skills).toEqual(["React"]);
    expect(parsed?.experience).toHaveLength(1);
    expect(parsed?.total_years_experience).toBe(60);
    expect(() => formatParsedResumeForAI(parsed)).not.toThrow();
  });
});
