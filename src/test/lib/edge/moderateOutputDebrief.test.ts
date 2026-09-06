import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("moderateOutput debrief JSON safety", () => {
  const source = fs.readFileSync(
    path.join(root, "supabase/functions/_shared/aiProvider.ts"),
    "utf8",
  );

  it("redacts JSON coaching payloads instead of replacing them wholesale", () => {
    expect(source).toContain("looksLikeJsonPayload");
    expect(source).toContain("compliance_redacted");
    expect(source).toContain("[redacted]");
    expect(source).not.toMatch(
      /const BLOCKED_PATTERNS = \[[\s\S]*?\/pretend\\s\+you\\s\+\(did\|have\|know\)\/i/,
    );
  });

  it("only blocks intentional deception coaching phrasing", () => {
    expect(source).toContain("you\\s+should|just|try\\s+to");
    expect(source).toContain("avoid false positives");
  });
});
