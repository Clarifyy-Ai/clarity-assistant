import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("score-coding-submission contracts", () => {
  it("uses shared javascriptSolveRunner and returns primary_error", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/score-coding-submission/index.ts"),
      "utf8",
    );
    expect(src).toContain("runJavascriptSolveTests");
    expect(src).toContain("primary_error");
    expect(src).toContain("case_results");
    expect(src).not.toContain("function runVisibleJavascriptTests");
    const shared = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/javascriptSolveRunner.ts"),
      "utf8",
    );
    expect(shared).toContain("normalizeSolveValue");
    expect(shared).toContain("captureConsole");
    expect(shared).toContain("stdout");
    expect(shared).toContain("stderr");
  });
});
