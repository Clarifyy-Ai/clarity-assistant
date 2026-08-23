import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isBlankCompanyName,
  normalizeCompanyName,
} from "@/lib/company/normalizeCompanyName";
import {
  companyResearchIdempotencyKey,
  normalizeCompanyName as normalizeCompanyNameEdge,
} from "../../../../supabase/functions/_shared/companyIdentity";

const CASES: Array<[string, string]> = [
  ["Google", "google"],
  ["  Google  ", "google"],
  ["GOOGLE", "google"],
  ["Goldman   Sachs", "goldman sachs"],
  ["Goldman\tSachs", "goldman sachs"],
  ["Goldman\nSachs", "goldman sachs"],
  [" Tata  Consultancy   Services ", "tata consultancy services"],
  ["https://www.Acme.com/", "acme.com"],
  ["HTTPS://WWW.GOOGLE.COM/about", "google.com"],
  ["acme.io", "acme.io"],
  ["", ""],
  ["   ", ""],
];

describe("normalizeCompanyName", () => {
  it("collapses whitespace, trims, and lowercases", () => {
    for (const [input, expected] of CASES) {
      expect(normalizeCompanyName(input)).toBe(expected);
    }
  });

  it("treats null and undefined as blank", () => {
    expect(normalizeCompanyName(null)).toBe("");
    expect(normalizeCompanyName(undefined)).toBe("");
    expect(isBlankCompanyName("   ")).toBe(true);
    expect(isBlankCompanyName("Acme")).toBe(false);
  });

  it("maps display variants to one cache identity", () => {
    expect(normalizeCompanyName("Acme Corp")).toBe(normalizeCompanyName("  acme   CORP "));
    expect(normalizeCompanyName("Acme")).not.toBe(normalizeCompanyName("Acme Inc"));
  });

  it("matches the Edge Function implementation", () => {
    for (const [input, expected] of CASES) {
      expect(normalizeCompanyNameEdge(input)).toBe(expected);
      expect(normalizeCompanyNameEdge(input)).toBe(normalizeCompanyName(input));
    }
  });

  it("matches the SQL definition used by company_name_normalized", () => {
    const sql = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260823140000_company_research_url_normalize_and_drop_legacy_unique.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("normalize_company_name");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS company_research_user_company_unique");
  });
});

describe("companyResearchIdempotencyKey", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  it("is stable for the same user and company", () => {
    const a = companyResearchIdempotencyKey({ userId, normalizedCompany: "acme corp" });
    const b = companyResearchIdempotencyKey({ userId, normalizedCompany: "acme corp" });
    expect(a).toBe(b);
    expect(a).toBe(`company-research:${userId}:acme-corp`);
  });

  it("separates users and companies", () => {
    expect(
      companyResearchIdempotencyKey({ userId, normalizedCompany: "acme corp" }),
    ).not.toBe(
      companyResearchIdempotencyKey({ userId, normalizedCompany: "globex" }),
    );
    expect(
      companyResearchIdempotencyKey({ userId, normalizedCompany: "acme corp" }),
    ).not.toBe(
      companyResearchIdempotencyKey({
        userId: "22222222-2222-4222-8222-222222222222",
        normalizedCompany: "acme corp",
      }),
    );
  });

  it("collapses forced refreshes inside the same minute but not across minutes", () => {
    const first = companyResearchIdempotencyKey({
      userId,
      normalizedCompany: "acme corp",
      force: true,
      now: new Date("2026-08-23T10:15:01.000Z"),
    });
    const sameMinute = companyResearchIdempotencyKey({
      userId,
      normalizedCompany: "acme corp",
      force: true,
      now: new Date("2026-08-23T10:15:59.000Z"),
    });
    const nextMinute = companyResearchIdempotencyKey({
      userId,
      normalizedCompany: "acme corp",
      force: true,
      now: new Date("2026-08-23T10:16:00.000Z"),
    });

    expect(first).toBe(sameMinute);
    expect(first).not.toBe(nextMinute);
  });
});
