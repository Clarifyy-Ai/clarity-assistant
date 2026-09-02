import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { PUBLIC_CTAS } from "@/lib/constants/publicCtas";

/** Public marketing route inventory — keep in sync with App.tsx and MarketingLayout footer. */
export type PublicMarketingRoute = {
  path: string;
  label: string;
  heading: string;
  entry: string;
  inventoryNote: string;
};

export type MarketingFooterLink =
  | { to: string; label: string; hash?: string }
  | { href: string; label: string; external?: boolean };

export const PUBLIC_MARKETING_COMPANY_ROUTES: PublicMarketingRoute[] = [
  {
    path: "/about",
    label: "About",
    heading: "About",
    entry: "Footer → Company → About",
    inventoryNote: "Company overview — no invented metrics",
  },
  {
    path: "/industries",
    label: "Industries",
    heading: "Industries",
    entry: "Footer → Company → Industries",
    inventoryNote: "Industries we serve — no customer logos",
  },
  {
    path: "/contact-sales",
    label: "Contact Sales",
    heading: "Contact Sales",
    entry: "Footer → Company → Contact Sales",
    inventoryNote: "Sales contact form",
  },
  {
    path: "/careers",
    label: "Careers",
    heading: "Careers",
    entry: "Footer → Company → Careers",
    inventoryNote: "Honest careers surface — no fake roles",
  },
  {
    path: "/cookies",
    label: "Cookies",
    heading: "Cookies",
    entry: "Footer → Company → Cookies",
    inventoryNote: "Cookie / telemetry notice",
  },
  {
    path: "/faq",
    label: "FAQ",
    heading: "FAQ",
    entry: "Footer → Company → FAQ",
    inventoryNote: "Product FAQ — deep articles live in Help Center",
  },
];

export const PUBLIC_MARKETING_CORE_ROUTES: PublicMarketingRoute[] = [
  {
    path: "/",
    label: "Home",
    heading: "Career Pilot",
    entry: "Site root",
    inventoryNote: "Marketing hero + CTAs",
  },
  {
    path: "/pricing",
    label: "Pricing",
    heading: "Pricing",
    entry: "Nav → Pricing",
    inventoryNote: "Plans & CTAs",
  },
  {
    path: "/gov-exams",
    label: PRODUCT_NAMES.govExams,
    heading: PRODUCT_NAMES.govExams,
    entry: "Nav → Gov Exams",
    inventoryNote: "Public gov exam marketing",
  },
  {
    path: "/help",
    label: PUBLIC_CTAS.help,
    heading: "Help Center",
    entry: "Header / footer → Help Center",
    inventoryNote: "Searchable help articles — not the same as /faq",
  },
  {
    path: "/shortcuts",
    label: "Shortcuts",
    heading: "Keyboard shortcuts",
    entry: "Nav → Shortcuts",
    inventoryNote: "Keyboard shortcuts reference",
  },
  {
    path: "/download",
    label: PUBLIC_CTAS.downloadDesktop,
    heading: "Download Career Pilot",
    entry: "Footer → Product → Download desktop",
    inventoryNote: "Windows installer for Practice Coach overlay",
  },
  {
    path: "/blog",
    label: "Blog",
    heading: "Blog",
    entry: "Nav / footer → Blog",
    inventoryNote: "Posts list",
  },
  {
    path: "/terms",
    label: "Terms of Service",
    heading: "Terms",
    entry: "Footer → Terms",
    inventoryNote: "Legal",
  },
  {
    path: "/privacy",
    label: "Privacy Policy",
    heading: "Privacy",
    entry: "Footer → Privacy",
    inventoryNote: "Legal",
  },
  {
    path: "/verify-certificate",
    label: "Verify certificate",
    heading: "Course Completion Certificate",
    entry: "Footer → Verify certificate",
    inventoryNote: "Public certificate verification",
  },
];

export const PUBLIC_MARKETING_ROUTE_PATHS: string[] = [
  ...PUBLIC_MARKETING_CORE_ROUTES.map((route) => route.path),
  ...PUBLIC_MARKETING_COMPANY_ROUTES.map((route) => route.path),
  "/help/getting-started",
  "/verify-certificate/:certificateId",
  "/blog/:slug",
  "/help/:slug",
  "/share/:token",
];

export const MARKETING_FOOTER_COMPANY_LINKS: MarketingFooterLink[] =
  PUBLIC_MARKETING_COMPANY_ROUTES.map((route) => ({
    to: route.path,
    label: route.label,
  }));

/** Compact bottom-bar links — always visible without scrolling footer columns. */
export const MARKETING_FOOTER_BOTTOM_LINKS: MarketingFooterLink[] = [
  { to: "/about", label: "About" },
  { to: "/faq", label: "FAQ" },
  { to: "/industries", label: "Industries" },
  { to: "/cookies", label: "Cookies" },
  { to: "/careers", label: "Careers" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/pricing", label: "Pricing" },
  { to: "/download", label: PUBLIC_CTAS.downloadDesktop },
  { to: "/blog", label: "Blog" },
  { to: "/gov-exams", label: PRODUCT_NAMES.govExams },
  { to: "/login", label: PUBLIC_CTAS.login },
];

export function isPublicMarketingPath(pathname: string): boolean {
  if (PUBLIC_MARKETING_ROUTE_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/help/")) return true;
  if (pathname.startsWith("/blog/")) return true;
  if (pathname.startsWith("/verify-certificate/")) return true;
  if (pathname.startsWith("/share/")) return true;
  return false;
}
