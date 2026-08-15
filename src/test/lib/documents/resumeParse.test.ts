import { describe, it, expect } from "vitest";
import { parseResumeContentString } from "@/lib/documents/resumeParse";

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
});
