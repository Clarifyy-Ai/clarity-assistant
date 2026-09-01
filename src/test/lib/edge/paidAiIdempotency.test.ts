import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

/** Paid AI Edge wrappers that must replay on x-idempotency-key. */
const PAID_AI_FUNCTIONS = [
  "gap-analysis",
  "company-research",
  "polish-star-section",
  "analyze-test-performance",
  "generate-scorecard",
  "generate-debrief",
  "generate-star-answer",
  "prep-tool",
  "process-sprint-transcript",
] as const;

describe("paid AI Edge idempotency source contracts", () => {
  it.each(PAID_AI_FUNCTIONS)(
    "$fn contains getIdempotentResponse or executeHybridOperation",
    (fn) => {
      const source = readFunction(fn);
      const usesHybrid = source.includes("executeHybridOperation");
      const usesReplay = source.includes("getIdempotentResponse");
      expect(usesHybrid || usesReplay).toBe(true);
    },
  );

  it.each(PAID_AI_FUNCTIONS)(
    "$fn reads x-idempotency-key when not relying solely on hybridExecute helpers",
    (fn) => {
      const source = readFunction(fn);
      if (!source.includes("executeHybridOperation")) {
        expect(source).toContain("getIdempotentResponse");
        expect(source).toMatch(/x-idempotency-key/i);
        expect(source).toContain("storeIdempotentResponse");
        return;
      }
      expect(source).toContain("idempotencyKey");
      expect(source).toMatch(/x-idempotency-key/i);
    },
  );
});
