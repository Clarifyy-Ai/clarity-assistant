import { PUBLIC_WEBSITE_URL } from "@/lib/constants/contact";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

export const SEO_SITE_ORIGIN = PUBLIC_WEBSITE_URL;

export const DEFAULT_SEO_TITLE = PRODUCT_NAMES.titleLong;

export const DEFAULT_SEO_DESCRIPTION =
  "AI-powered interview prep and government exam practice for India. Mock interviews, Practice Coach, UPSC, SSC CGL, IBPS, JEE, NEET — timed papers, STAR answers, and performance insights.";

/** High-intent keywords used on public pages. Keep phrases natural; do not keyword-stuff copy. */
export const DEFAULT_SEO_KEYWORDS = [
  "Career Pilot",
  "AI interview preparation",
  "mock interview practice India",
  "UPSC CSE mock test",
  "SSC CGL mock test",
  "IBPS PO mock test",
  "JEE Main practice test",
  "NEET UG mock test",
  "AI interview coach",
  "STAR method interview answers",
  "government exam preparation",
  "online mock interview",
  "exam practice with previous year papers",
].join(", ");

export type PublicSeoPage = {
  path: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
  title: string;
  description: string;
  keywords: string;
};

function page(
  path: string,
  changefreq: PublicSeoPage["changefreq"],
  priority: number,
  title: string,
  description: string,
  extraKeywords: string[] = [],
): PublicSeoPage {
  const keywords = extraKeywords.length
    ? `${DEFAULT_SEO_KEYWORDS}, ${extraKeywords.join(", ")}`
    : DEFAULT_SEO_KEYWORDS;
  return { path, changefreq, priority, title, description, keywords };
}

/** Indexable marketing URLs (not /app, /auth callback, or onboarding). */
export const PUBLIC_SEO_PAGES: PublicSeoPage[] = [
  page("/", "daily", 1.0, DEFAULT_SEO_TITLE, DEFAULT_SEO_DESCRIPTION, [
    "Career Pilot app",
    "interview rehearsal",
  ]),
  page(
    "/gov-exams",
    "weekly",
    0.95,
    `${PRODUCT_NAMES.govExams} — UPSC, SSC, IBPS, JEE, NEET | ${PRODUCT_NAMES.brand}`,
    "Timed MCQ mock tests for UPSC CSE, SSC CGL, IBPS PO, JEE Main, NEET UG, and PSU exams with previous-year patterns and analytics.",
    ["UPSC mock test online", "SSC CGL previous year paper", "IBPS PO practice"],
  ),
  page(
    "/pricing",
    "monthly",
    0.9,
    `Pricing — ${PRODUCT_NAMES.brand}`,
    "Free, Pro, and Max plans for Career Pilot. One-time INR purchases via Razorpay — mock interviews, Practice Coach, and government exam papers.",
    ["Career Pilot pricing", "interview prep subscription India"],
  ),
  page(
    "/blog",
    "daily",
    0.85,
    `Blog — ${PRODUCT_NAMES.brand}`,
    "Interview prep guides, STAR method tips, government exam strategy, and AI coaching insights from Career Pilot.",
    ["interview tips India", "STAR method examples"],
  ),
  page(
    "/help",
    "weekly",
    0.8,
    `Help Center — ${PRODUCT_NAMES.brand}`,
    "FAQs and guides for Practice Coach, mock interviews, government exam mocks, credits, and billing.",
    ["Career Pilot help", "how to use Practice Coach"],
  ),
  page(
    "/faq",
    "monthly",
    0.75,
    `FAQ — ${PRODUCT_NAMES.brand}`,
    "Answers about Career Pilot credits, Practice Coach, government exam mocks, and billing.",
    ["Career Pilot FAQ"],
  ),
  page(
    "/about",
    "yearly",
    0.6,
    `About — ${PRODUCT_NAMES.brand}`,
    "Career Pilot is AI-powered career and exam preparation from Payara Labs — practice interviews and government exams with confidence.",
  ),
  page(
    "/industries",
    "monthly",
    0.55,
    `Industries — ${PRODUCT_NAMES.brand}`,
    "Interview prep for consulting, product, software, banking, and government roles.",
  ),
  page(
    "/careers",
    "monthly",
    0.5,
    `Careers — ${PRODUCT_NAMES.brand}`,
    "Join Payara Labs. Build AI interview and exam-prep tools at Career Pilot.",
  ),
  page(
    "/contact-sales",
    "yearly",
    0.5,
    `Contact sales — ${PRODUCT_NAMES.brand}`,
    "Talk to Career Pilot about teams, institutes, and bulk access.",
  ),
  page(
    "/shortcuts",
    "yearly",
    0.4,
    `Keyboard shortcuts — ${PRODUCT_NAMES.brand}`,
    "Keyboard shortcuts for Career Pilot practice sessions and the web app.",
  ),
  page(
    "/download",
    "monthly",
    0.65,
    `Download desktop — ${PRODUCT_NAMES.brand}`,
    "Download the Career Pilot Windows app for Practice Coach overlay sessions. Sign in with the same account as trycareerpilot.com.",
    ["Career Pilot download", "Practice Coach Windows app"],
  ),
  page(
    "/cookies",
    "yearly",
    0.35,
    `Cookies — ${PRODUCT_NAMES.brand}`,
    "How Career Pilot uses essential cookies, analytics, and optional Google Ads conversion tags.",
  ),
  page(
    "/terms",
    "yearly",
    0.35,
    `Terms of Service — ${PRODUCT_NAMES.brand}`,
    "Terms of use for Career Pilot interview and exam preparation.",
  ),
  page(
    "/privacy",
    "yearly",
    0.35,
    `Privacy Policy — ${PRODUCT_NAMES.brand}`,
    "How Career Pilot collects, uses, and protects your data.",
  ),
  page(
    "/login",
    "yearly",
    0.45,
    `Log in — ${PRODUCT_NAMES.brand}`,
    "Sign in to Career Pilot to continue mock interviews and exam practice.",
  ),
  page(
    "/signup",
    "monthly",
    0.7,
    `Create account — ${PRODUCT_NAMES.brand}`,
    "Create a free Career Pilot account for AI mock interviews and government exam practice.",
    ["Career Pilot signup", "free mock interview account"],
  ),
];

export function seoPageByPath(path: string): PublicSeoPage | undefined {
  return PUBLIC_SEO_PAGES.find((p) => p.path === path);
}

export function absoluteSeoUrl(path: string, origin = SEO_SITE_ORIGIN): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return trimmed === "/" ? `${origin}/` : `${origin}${trimmed}`;
}

export function keywordsForPath(path: string): string {
  return seoPageByPath(path)?.keywords ?? DEFAULT_SEO_KEYWORDS;
}
