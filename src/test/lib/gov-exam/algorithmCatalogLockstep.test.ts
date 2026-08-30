import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8")) as Record<string, unknown>;
}

function readEdgeConstants(source: string): Record<string, string | number> {
  const versions: Record<string, string | number> = {};
  const stringAssigns = [
    "CREDIT_CATALOG_VERSION",
    "QUALITY_ALGORITHM_VERSION",
    "DEDUP_ALGORITHM_VERSION",
    "MASTERY_ALGORITHM_VERSION",
    "SCORING_ALGORITHM_VERSION",
    "PAPER_BLUEPRINT_VERSION",
  ];
  for (const name of stringAssigns) {
    const match = source.match(new RegExp(`export const ${name} = "([^"]+)"`));
    if (match) versions[name] = match[1];
  }
  const min = source.match(/export const MIN_BANK_QUESTION_QUALITY = (\d+)/);
  if (min) versions.MIN_BANK_QUESTION_QUALITY = Number(min[1]);
  return versions;
}

describe("algorithm catalog lockstep", () => {
  it("repo-root, Docker Python copy, and Edge constants share versions and thresholds", () => {
    const rootCatalog = readJson("shared/algorithm-catalog.json");
    const pythonCatalog = readJson("scraper/app/shared/algorithm_catalog.json");
    const frontendCatalog = readJson("src/lib/gov-exam/algorithmCatalog.json");
    const edgeSource = readFileSync(
      path.join(root, "supabase/functions/_shared/algorithmCatalog.ts"),
      "utf8",
    );
    const edge = readEdgeConstants(edgeSource);

    expect(pythonCatalog).toEqual(rootCatalog);
    expect(frontendCatalog).toEqual(rootCatalog);

    expect(edge.CREDIT_CATALOG_VERSION).toBe(rootCatalog.credit_catalog_version);
    expect(edge.QUALITY_ALGORITHM_VERSION).toBe(rootCatalog.quality_algorithm_version);
    expect(edge.DEDUP_ALGORITHM_VERSION).toBe(rootCatalog.dedup_algorithm_version);
    expect(edge.MASTERY_ALGORITHM_VERSION).toBe(rootCatalog.mastery_algorithm_version);
    expect(edge.SCORING_ALGORITHM_VERSION).toBe(rootCatalog.scoring_algorithm_version);
    expect(edge.PAPER_BLUEPRINT_VERSION).toBe(rootCatalog.paper_blueprint_version);
    expect(edge.MIN_BANK_QUESTION_QUALITY).toBe(
      (rootCatalog.quality as { min_bank_question_quality: number }).min_bank_question_quality,
    );

    expect(edgeSource).toContain("near_duplicate_composite: 0.65");
    expect(edgeSource).toContain("review_composite: 0.45");
    expect(JSON.stringify(rootCatalog.dedup)).toContain("\"near_duplicate_composite\":0.65");
  });
});
