import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandLogo } from "@/components/marketing";
import { Menu, X, Github, LifeBuoy } from "lucide-react";
import {
  SUPPORT_EMAIL,
  LEGAL_ENTITY_NAME,
  GITHUB_ORG_URL,
  STATUS_PAGE_URL,
  STATUS_REPORT_MAILTO,
  PUBLIC_STATUS_FOOTER_LABEL,
} from "@/lib/constants/contact";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { PUBLIC_CTAS } from "@/lib/constants/publicCtas";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { cn } from "@/lib/utils";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import { MARKETING_SHELL } from "@/lib/ui/responsivePage";
import { hydrateBillingCatalog } from "@/lib/billing/liveCatalog";
import {
  MARKETING_FOOTER_BOTTOM_LINKS,
  MARKETING_FOOTER_COMPANY_LINKS,
  type MarketingFooterLink,
} from "@/lib/routes/publicMarketing";

type NavItem = MarketingFooterLink;

/** Header nav — short labels for narrow / tablet drawer (PUBLIC-002). */
const NAV_LINKS: NavItem[] = [
  { to: "/", hash: "features", label: "Features" },
  { to: "/gov-exams", label: "Gov Exams" },
  { to: "/pricing", label: "Pricing" },
  { to: "/shortcuts", label: "Shortcuts" },
  { to: "/blog", label: "Blog" },
];

const HELP_NAV: NavItem = { to: "/help", label: PUBLIC_CTAS.helpShort };

const FOOTER_COLUMNS: Array<{
  heading: string;
  links: NavItem[];
}> = [
  {
    heading: "Product",
    links: [
      { to: "/", hash: "features", label: "Features" },
      { to: "/gov-exams", label: PRODUCT_NAMES.govExams },
      { to: "/pricing", label: "Pricing" },
      { to: "/download", label: PUBLIC_CTAS.downloadDesktop },
      { to: "/shortcuts", label: "Shortcuts" },
      { to: "/signup", label: PUBLIC_CTAS.signup },
    ],
  },
  {
    heading: "Resources",
    links: [
      { to: "/blog", label: "Blog" },
      { to: "/help", label: PUBLIC_CTAS.help },
      { to: "/help/getting-started", label: "Getting started" },
      { to: "/verify-certificate", label: "Verify certificate" },
    ],
  },
  {
    heading: "Company",
    links: [
      ...MARKETING_FOOTER_COMPANY_LINKS,
      { to: "/terms", label: "Terms of Service" },
      { to: "/privacy", label: "Privacy Policy" },
      { to: "/login", label: PUBLIC_CTAS.login },
    ],
  },
  {
    heading: "Support",
    links: [
      { href: `mailto:${SUPPORT_EMAIL}`, label: "Email support" },
      STATUS_PAGE_URL
        ? { href: STATUS_PAGE_URL, label: PUBLIC_STATUS_FOOTER_LABEL, external: true }
        : { href: STATUS_REPORT_MAILTO, label: PUBLIC_STATUS_FOOTER_LABEL },
      { href: GITHUB_ORG_URL, label: "GitHub", external: true },
    ],
  },
];

function scrollToHash(hash: string) {
  const id = hash.replace(/^#/, "");
  if (!id) return;
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function MarketingNavLink({
  item,
  className,
  onNavigate,
}: {
  item: NavItem;
  className?: string;
  onNavigate?: () => void;
}) {
  if ("href" in item) {
    return (
      <a
        href={item.href}
        target={item.external ? "_blank" : undefined}
        rel={item.external ? "noopener noreferrer" : undefined}
        onClick={onNavigate}
        className={className}
      >
        {item.label}
      </a>
    );
  }

  const to = item.hash ? { pathname: item.to, hash: item.hash } : item.to;

  return (
    <Link
      to={to}
      onClick={() => {
        onNavigate?.();
        if (item.hash) scrollToHash(item.hash);
      }}
      className={className}
    >
      {item.label}
    </Link>
  );
}

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export function MarketingLayout({ children }: MarketingLayoutProps) {
  const { pathname, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useBodyScrollLock(menuOpen);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    void hydrateBillingCatalog();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  // Reset scroll on route change so footer/nav links land at the top of the page.
  // Hash deep-links (e.g. /#features) are handled by ScrollToTop + the effect below.
  // Honor deep links like /#features after SPA navigation.
  useEffect(() => {
    if (pathname === "/" && hash) {
      scrollToHash(hash);
    }
  }, [pathname, hash]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <nav
        aria-label="Main navigation"
        className="fixed top-0 inset-x-0 z-[110] border-b border-border bg-background/80 backdrop-blur-xl"
      >
        <div className={`${MARKETING_SHELL} flex items-center justify-between px-4 sm:px-6 h-16`}>
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Career Pilot home"
          >
            <BrandLogo size="md" />
          </Link>
          {/* Desktop links from lg+ — drawer below that avoids cramped wrapping at 375–1023. */}
          <div className="hidden lg:flex items-center gap-5 xl:gap-8 text-sm text-muted-foreground">
            {NAV_LINKS.map((link) => {
              const key = "to" in link ? `${link.to}#${link.hash ?? ""}` : link.href;
              const isActive =
                "to" in link &&
                !link.hash &&
                (link.to === "/" ? pathname === "/" : pathname.startsWith(link.to));
              return (
                <MarketingNavLink
                  key={key}
                  item={link}
                  className={cn(
                    "transition-colors whitespace-nowrap",
                    isActive ? "text-foreground" : "hover:text-foreground",
                  )}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <MarketingNavLink
                item={HELP_NAV}
                className={cn(
                  "text-sm transition-colors whitespace-nowrap",
                  pathname.startsWith("/help")
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              />
              <ThemeToggle className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
            </div>
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              {PUBLIC_CTAS.login}
            </Link>
            <Link
              to="/signup"
              className="text-xs sm:text-sm font-semibold px-2.5 sm:px-5 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
            >
              <span className="sm:hidden">{PUBLIC_CTAS.signupShort}</span>
              <span className="hidden sm:inline">{PUBLIC_CTAS.signup}</span>
            </Link>
            <button
              type="button"
              className="lg:hidden p-1.5 sm:p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all shrink-0"
              onClick={() => setMenuOpen((p) => !p)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="marketing-mobile-nav"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div
          id="marketing-mobile-nav"
          className="lg:hidden fixed inset-0 z-[100]"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 h-full w-full bg-background/70 backdrop-blur-sm animate-in fade-in duration-200"
          />
          <div className="absolute inset-x-0 top-16 bottom-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-1 animate-in slide-in-from-top-2 fade-in duration-200">
            {[...NAV_LINKS, HELP_NAV].map((link) => {
              const key = "to" in link ? `${link.to}#${link.hash ?? ""}` : link.href;
              const isActive =
                "to" in link &&
                !link.hash &&
                (link.to === "/" ? pathname === "/" : pathname.startsWith(link.to));
              return (
                <MarketingNavLink
                  key={key}
                  item={link}
                  onNavigate={() => setMenuOpen(false)}
                  className={cn(
                    "block px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/40",
                  )}
                />
              );
            })}
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors sm:hidden"
            >
              {PUBLIC_CTAS.login}
            </Link>
          </div>
        </div>
      )}

      <main id="main-content" className="pt-16">
        {children}
      </main>

      <footer className="border-t border-border bg-background" role="contentinfo">
        <div className={`${MARKETING_SHELL} px-4 sm:px-6 pt-12 pb-8`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-10 mb-10 text-left items-start">
            <div className="col-span-2 sm:col-span-3 lg:col-span-1">
              <Link
                to="/"
                className="inline-flex mb-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Career Pilot home"
              >
                <BrandLogo size="sm" />
              </Link>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
                AI interview coaching, gov exam mock tests, and live practice for every career stage.
              </p>
              <div className="flex gap-3 mt-4">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  aria-label="Email support"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
                >
                  <LifeBuoy className="w-4 h-4" />
                </a>
                <a
                  href={GITHUB_ORG_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
                >
                  <Github className="w-4 h-4" />
                </a>
              </div>
            </div>
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.heading} className="min-w-0">
                <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3">
                  {col.heading}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <MarketingNavLink
                        item={link}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              &copy; {new Date().getFullYear()} {LEGAL_ENTITY_NAME}. All rights reserved.
            </span>
            <div className="flex gap-4 flex-wrap justify-center sm:justify-end">
              {MARKETING_FOOTER_BOTTOM_LINKS.map((link) => (
                <MarketingNavLink
                  key={link.label}
                  item={link}
                  className="hover:text-foreground transition-colors"
                />
              ))}
            </div>
          </div>
        </div>
      </footer>
      <SupportChatWidget />
    </div>
  );
}
