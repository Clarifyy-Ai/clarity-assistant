import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCanonicalActionCost } from "@/lib/billing/actionCreditGate";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("contextPolicies client/edge drift", () => {
  it("client subset keys exist on edge with matching required keys", () => {
    const client = fs.readFileSync(
      path.join(root, "src/lib/ai/contextPolicies.ts"),
      "utf8",
    );
    const edge = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/contextPolicies.ts"),
      "utf8",
    );
    const clientBlocks = [...client.matchAll(/^\s{2}(\w+):\s*\{([\s\S]*?)^\s{2}\},/gm)];
    for (const [, op, block] of clientBlocks) {
      expect(edge).toContain(`${op}: {`);
      const clientRequired = block.match(/requiredKeys:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
      const edgeBlock = edge.match(new RegExp(`${op}:\\s*\\{([\\s\\S]*?)\\n\\s{2}\\},`))?.[1] ?? "";
      expect(edgeBlock).toContain("requiredKeys:");
      for (const key of clientRequired.match(/"([^"]+)"/g) ?? []) {
        expect(edgeBlock).toContain(key);
      }
    }
  });
});

describe("actionCreditGate alias drift", () => {
  const aliasSamples = [
    "scorecard_generate",
    "generate_debrief",
    "star_analyse",
    "screenshot_analyse",
    "live_answer_long",
    "liveanswerlong",
    "prep_tool_star_method",
    "mocksessionquestion",
  ] as const;

  it.each(aliasSamples)("resolves %s to catalog cost", (alias) => {
    const cost = resolveCanonicalActionCost(alias);
    expect(cost).toBeDefined();
    expect(cost).toBeGreaterThan(0);
  });

  it("matches known catalog values for drift keys", () => {
    expect(resolveCanonicalActionCost("gap_analysis")).toBe(AI_CREDIT_COSTS.gap_analysis);
    expect(resolveCanonicalActionCost("liveanswerlong")).toBe(
      AI_CREDIT_COSTS.live_answer + 4,
    );
  });
});
