import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("prep-tool credit-first gate", () => {
  it("returns 402 before Unknown tool_id and aliases raw_prompt", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/prep-tool/index.ts"),
      "utf8",
    );
    const creditIdx = src.indexOf("INSUFFICIENT_CREDITS");
    const unknownIdx = src.indexOf("Unknown tool_id");
    expect(creditIdx).toBeGreaterThan(0);
    expect(unknownIdx).toBeGreaterThan(creditIdx);
    expect(src).toContain('"raw_prompt"');
    expect(src).toContain("creditDenialResponse");
  });
});
