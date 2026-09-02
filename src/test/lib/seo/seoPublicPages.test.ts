import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEO_KEYWORDS,
  PUBLIC_SEO_PAGES,
  absoluteSeoUrl,
  seoPageByPath,
} from "@/lib/seo/publicPages";
import { getCookieConsent, hasMarketingConsent, setCookieConsent } from "@/lib/privacy/cookieConsent";
import { isGoogleAdsConfigured } from "@/lib/ads/googleAds";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readRepo(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("public SEO pages", () => {
  it("lists unique indexable paths with high-intent keywords", () => {
    const paths = PUBLIC_SEO_PAGES.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(seoPageByPath("/")?.priority).toBe(1);
    expect(DEFAULT_SEO_KEYWORDS).toMatch(/UPSC CSE mock test/i);
    expect(DEFAULT_SEO_KEYWORDS).toMatch(/SSC CGL/i);
    expect(DEFAULT_SEO_KEYWORDS).toMatch(/AI interview/i);
    expect(absoluteSeoUrl("/gov-exams")).toBe("https://trycareerpilot.com/gov-exams");
  });

  it("stays in sync with the sitemap generator and committed sitemap.xml", () => {
    const script = readRepo("scripts/generate-sitemap.mjs");
    const sitemap = readRepo("public/sitemap.xml");
    for (const page of PUBLIC_SEO_PAGES) {
      expect(script).toContain(`path: "${page.path}"`);
      const loc =
        page.path === "/"
          ? "https://trycareerpilot.com/"
          : `https://trycareerpilot.com${page.path}`;
      expect(sitemap).toContain(`<loc>${loc}</loc>`);
    }
    expect(sitemap).not.toMatch(/<loc>https:\/\/trycareerpilot.com\/app\//);
  });
});

describe("cookie consent + Google Ads gate", () => {
  it("treats missing consent as no marketing cookies", () => {
    localStorage.clear();
    expect(getCookieConsent()).toBeNull();
    expect(hasMarketingConsent()).toBe(false);
    expect(isGoogleAdsConfigured()).toBe(false);
  });

  it("records accept/decline without throwing", () => {
    setCookieConsent("accepted");
    expect(hasMarketingConsent()).toBe(true);
    setCookieConsent("declined");
    expect(hasMarketingConsent()).toBe(false);
  });
});

describe("crawler files", () => {
  it("points robots.txt at the sitemap and allows major crawlers", () => {
    const robots = readRepo("public/robots.txt");
    expect(robots).toContain("https://trycareerpilot.com/sitemap.xml");
    expect(robots).toContain("AdsBot-Google");
    expect(robots).toContain("DuckDuckBot");
    expect(robots).toContain("Disallow: /app/");
  });

  it("allows Google tag hosts in CSP and ships homepage keywords", () => {
    const html = readRepo("index.html");
    expect(html).toContain("https://www.googletagmanager.com");
    expect(html).toContain("https://www.googleadservices.com");
    expect(html).toContain('name="keywords"');
    expect(html).toContain("UPSC CSE mock test");
    expect(html).not.toContain("twitter.com/clarifyai");
  });
});
