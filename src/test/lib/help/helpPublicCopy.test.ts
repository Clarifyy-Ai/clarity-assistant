import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_PAISE_FALLBACK } from "@/lib/billing/liveCatalog";
import { formatInrPaise } from "@/lib/billing/priceCalculator";
import { ROUTES } from "@/lib/constants/apiEndpoints";
import { PRIVACY_EMAIL, PUBLIC_STATUS_FOOTER_LABEL } from "@/lib/constants/contact";
import {
  HELP_ARTICLES_FALLBACK,
  resolveHelpArticleDisplay,
} from "@/lib/constants/helpArticlesFallback";
import {
  HELP_COPY_KIND,
  HELP_CREDIT_COSTS,
  HELP_CREDITS_OVERVIEW_ANSWER,
  HELP_EXTRA_CREDITS_ANSWER,
  HELP_PACK_LIST,
  HELP_PACK_PRICES,
  HELP_PAID_PLANS_ANSWER,
  HELP_PLAN_PRICES,
  HELP_PUBLIC_PATHS,
  helpCopyLooksStale,
} from "@/lib/help/helpCatalogCopy";
import { AI_CREDIT_COSTS, PLAN_MONTHLY_CREDITS } from "@/lib/constants/creditEconomics";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readRepo(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function publicHelpText(): string {
  const fallback = HELP_ARTICLES_FALLBACK.map(
    (a) => `${a.question}\n${a.answer}\n${a.body_md ?? ""}`,
  ).join("\n");
  return `${fallback}\n${HELP_PAID_PLANS_ANSWER}\n${HELP_CREDITS_OVERVIEW_ANSWER}\n${HELP_EXTRA_CREDITS_ANSWER}`;
}

describe("help catalog tokens", () => {
  it("formats India catalog prices from CATALOG_PAISE_FALLBACK", () => {
    expect(HELP_PLAN_PRICES.pro).toBe(formatInrPaise(CATALOG_PAISE_FALLBACK.pro_monthly));
    expect(HELP_PLAN_PRICES.max).toBe(formatInrPaise(CATALOG_PAISE_FALLBACK.enterprise_monthly));
    expect(HELP_PLAN_PRICES.pro).toContain("2,499");
    expect(HELP_PLAN_PRICES.max).toContain("6,799");
    expect(HELP_PLAN_PRICES.pro).not.toContain("$");
    expect(HELP_PACK_PRICES.credits_50).toBe(formatInrPaise(CATALOG_PAISE_FALLBACK.credits_50));
  });

  it("matches live credit ledger costs", () => {
    expect(HELP_CREDIT_COSTS.liveHint).toBe(AI_CREDIT_COSTS.live_hint);
    expect(HELP_CREDIT_COSTS.liveAnswer).toBe(AI_CREDIT_COSTS.live_answer);
    expect(HELP_CREDIT_COSTS.sessionDebrief).toBe(AI_CREDIT_COSTS.session_debrief);
    expect(HELP_CREDIT_COSTS.starBuilder).toBe(AI_CREDIT_COSTS.star_builder);
    expect(HELP_CREDIT_COSTS.companyResearch).toBe(AI_CREDIT_COSTS.company_research);
  });
});

describe("help / FAQ public copy (TC-PUB-004, TC-PUB-009, DEF-HELP-COPY)", () => {
  it("uses INR one-time prices and current credit allotments, not USD", () => {
    const text = publicHelpText();
    expect(text).toContain(HELP_PLAN_PRICES.pro);
    expect(text).toContain(HELP_PLAN_PRICES.max);
    expect(text).toContain(String(PLAN_MONTHLY_CREDITS.free));
    expect(text).toContain(PLAN_MONTHLY_CREDITS.pro.toLocaleString("en-IN"));
    expect(text).not.toMatch(/\$\s*\d/);
    expect(text).not.toMatch(/\$29|\$79/);
    expect(text).not.toMatch(/\bUSD\b/);
    expect(text).not.toMatch(/unlimited credits/i);
    expect(text).not.toMatch(/yearly billing/i);
  });

  it("states extra-credit packs are available at live sizes", () => {
    const text = publicHelpText();
    expect(HELP_PACK_LIST).toBe("50, 150, 500");
    expect(text).toContain("50, 150, 500");
    expect(text).toMatch(/extra credit packs/i);
    expect(text).not.toMatch(/packs are not available/i);
    expect(text).not.toMatch(/A la carte credit packs are not available/i);
  });

  it("lists current tool costs against the credit ledger", () => {
    const bi1 = HELP_ARTICLES_FALLBACK.find((a) => a.slug === "bi-1");
    const body = bi1?.body_md ?? "";
    expect(body).toContain(`Live hint: ${AI_CREDIT_COSTS.live_hint} credits`);
    expect(body).toContain(`Full answer: ${AI_CREDIT_COSTS.live_answer} credits`);
    expect(body).toContain(`Mock session debrief: ${AI_CREDIT_COSTS.session_debrief} credits`);
    expect(body).toContain(`STAR builder: ${AI_CREDIT_COSTS.star_builder} credits`);
    expect(body).toContain(`Company research: ${AI_CREDIT_COSTS.company_research} credits`);
    expect(body).toContain(HELP_COPY_KIND.current);
    expect(HELP_ARTICLES_FALLBACK.find((a) => a.slug === "li-4")?.body_md).toContain(
      HELP_COPY_KIND.example,
    );
  });

  it("does not treat current India copy as stale", () => {
    for (const article of HELP_ARTICLES_FALLBACK) {
      expect(
        helpCopyLooksStale(`${article.question}\n${article.answer}\n${article.body_md ?? ""}`),
        article.slug,
      ).toBe(false);
    }
  });

  it("replaces stale USD CMS rows with India fallback", () => {
    const stale = resolveHelpArticleDisplay({
      slug: "bi-2",
      category_slug: "billing",
      category_title: "Billing & Credits",
      question: "How much do paid plans cost?",
      answer: "Pro is $29 / month for 2,000 credits. Enterprise is $79 / month per seat with unlimited credits.",
      body_md:
        "Pro is **$29 / month**. Enterprise is **$79 / month**. Yearly billing saves roughly two months.",
      sort_order: 20,
    });
    expect(stale.answer).toContain(HELP_PLAN_PRICES.pro);
    expect(stale.answer).not.toMatch(/\$29/);
    expect(stale.body_md).toContain("one-time");
    expect(helpCopyLooksStale(stale.answer)).toBe(false);
  });

  it("replaces stale extra-credit and practice-cost CMS rows", () => {
    const packs = resolveHelpArticleDisplay({
      slug: "bi-5",
      category_slug: "billing",
      category_title: "Billing & Credits",
      question: "Can I buy extra credits?",
      answer: "A la carte credit packs are not available at launch.",
      body_md: "A la carte credit packs are not available at launch.",
      sort_order: 50,
    });
    expect(packs.answer).toMatch(/50, 150, 500/);
    expect(packs.answer).not.toMatch(/not available/i);

    const costs = resolveHelpArticleDisplay({
      slug: "li-4",
      category_slug: "live-interview",
      category_title: "Live Interview",
      question: "How many credits does a practice session cost?",
      answer: "Each requested hint costs 1 credit and each generated STAR answer costs 2 credits.",
      body_md:
        "Each requested hint costs **1 credit**. Each generated STAR-format answer costs **2 credits**. The end-of-session debrief is **5 credits**.",
      sort_order: 40,
    });
    expect(costs.answer).toContain(String(AI_CREDIT_COSTS.live_hint));
    expect(costs.answer).toContain(String(AI_CREDIT_COSTS.live_answer));
    expect(costs.answer).toContain(String(AI_CREDIT_COSTS.session_debrief));
  });

  it("keeps public help links on live routes", () => {
    const text = publicHelpText();
    expect(text).toContain(HELP_PUBLIC_PATHS.pricing);
    expect(text).toContain("Settings → Billing");
    expect(HELP_PUBLIC_PATHS.pricing).toBe(ROUTES.PRICING);
    expect(HELP_PUBLIC_PATHS.help).toBe(ROUTES.HELP);
    expect(HELP_PUBLIC_PATHS.billing).toBe(ROUTES.SETTINGS_BILLING);

    const app = readRepo("src/App.tsx");
    expect(app).toContain(`path: "${HELP_PUBLIC_PATHS.pricing}"`);
    expect(app).toContain(`path: "${HELP_PUBLIC_PATHS.help}"`);
    expect(app).toContain(`path: "${HELP_PUBLIC_PATHS.faq}"`);
    expect(app).toContain(HELP_PUBLIC_PATHS.billing);

    const faq = readRepo("src/pages/marketing/Faq.tsx");
    expect(faq).toContain('to="/help"');
    expect(faq).not.toMatch(/\$29|\$79/);
  });

  it("aligns Help and footer status labels", () => {
    expect(PUBLIC_STATUS_FOOTER_LABEL).toBe("Report an outage");
    const help = readRepo("src/pages/marketing/Help.tsx");
    const footer = readRepo("src/components/layout/MarketingLayout.tsx");
    expect(help).toContain("PUBLIC_STATUS_FOOTER_LABEL");
    expect(footer).toContain("PUBLIC_STATUS_FOOTER_LABEL");
    expect(help).not.toMatch(/No public status page configured/);
  });

  it("keeps privacy contact on the live mailbox, not a stale clarifyprep address", () => {
    expect(PRIVACY_EMAIL).toBe("hello@trycareerpilot.com");
    const privacy = readRepo("src/pages/marketing/Privacy.tsx");
    expect(privacy).toContain("PRIVACY_EMAIL");
    expect(privacy).not.toMatch(/clarifyprep/i);
    expect(privacy).not.toMatch(/privacy@clarifyprep/);
  });
});

describe("help_articles INR credit parity migration", () => {
  it("rewrites CMS rows to INR, live credit costs, and extra packs", () => {
    const sql = readRepo("supabase/migrations/20260902220100_help_articles_inr_credit_parity.sql");
    expect(sql).toContain("INR 2,499");
    expect(sql).toContain("INR 6,799");
    expect(sql).toContain("50, 150, 500");
    expect(sql).toContain("INR 699");
    expect(sql).toContain("Live hint: 2 credits");
    expect(sql).toContain("Full answer: 8 credits");
    expect(sql).toContain("STAR builder: 10 credits");
    expect(sql).toContain("Company research: 20 credits");
    expect(sql).toContain("/pricing");
    expect(sql).toMatch(/Settings -> Billing/);
    expect(sql).not.toMatch(/\$29|\$79/);
    expect(sql).not.toMatch(/packs are not available/i);
    expect(sql).not.toMatch(/unlimited credits/i);
  });
});
