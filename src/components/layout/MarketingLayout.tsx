import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandLogo } from "@/components/marketing";
import { Menu, X, Twitter, Github } from "lucide-react";
import { SALES_EMAIL, STATUS_PAGE_URL, LEGAL_ENTITY_NAME } from "@/lib/constants/contact";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { cn } from "@/lib/utils";

const NAV_LINKS: Array<{ to?: string; href?: string; label: string }> = [
  { href: "/#features", label: "Features" },
  { to: "/gov-exams", label: PRODUCT_NAMES.govExams },
  { to: "/pricing", label: "Pricing" },
  { to: "/shortcuts", label: "Shortcuts" },
  { to: "/blog", label: "Blog" },
  { to: "/help", label: "Help" },
];

const FOOTER_COLUMNS: Array<{
  heading: string;
  links: Array<
    | { href: string; label: string; external?: boolean }
    | { to: string; label: string }
  >;
}> = [
  {
    heading: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { to: "/gov-exams", label: PRODUCT_NAMES.govExams },
      { to: "/pricing", label: "Pricing" },
      { to: "/shortcuts", label: "Shortcuts" },
      { to: "/signup", label: "Get started free" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { to: "/blog", label: "Blog" },
      { to: "/help", label: "Help Center" },
      { to: "/help/getting-started", label: "Getting started" },
      { to: "/shortcuts", label: "Keyboard shortcuts" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: `mailto:${SALES_EMAIL}`, label: "Contact Sales" },
      { to: "/terms", label: "Terms of Service" },
      { to: "/privacy", label: "Privacy Policy" },
      { to: "/signup", label: "Sign up free" },
      { to: "/login", label: "Log in" },
    ],
  },
  {
    heading: "Social",
    links: [
      { href: "https://twitter.com/clarifyai", label: "Twitter / X", external: true },
      { href: "https://github.com/clarifyai", label: "GitHub", external: true },
    ],
  },
];

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export function MarketingLayout({ children }: MarketingLayoutProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // 1 + 2 + 3 + 5: lock the background while the drawer is open, restore on close.
  useBodyScrollLock(menuOpen);

  // Close on route change and on Escape.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);


  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium">
        Skip to content
      </a>
      <nav aria-label="Main navigation" className="fixed top-0 inset-x-0 z-[110] border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandLogo size="md" />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            {NAV_LINKS.map((link) => {
              const key = link.to ?? link.href ?? link.label;
              const isActive = link.to
                ? link.to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.to)
                : false;
              const className = cn(
                "transition-colors",
                isActive ? "text-foreground" : "hover:text-foreground",
              );
              if (link.href) {
                return (
                  <a key={key} href={link.href} className={className}>
                    {link.label}
                  </a>
                );
              }
              return (
                <Link key={key} to={link.to!} className={className}>
                  {link.label}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline-block"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="text-xs sm:text-sm font-semibold px-3 sm:px-5 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Get started free
            </Link>
            <button
              type="button"
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
              onClick={() => setMenuOpen((p) => !p)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

      </nav>

      {/* Mobile drawer: full-viewport overlay, independently scrollable panel */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 h-full w-full bg-background/70 backdrop-blur-sm animate-in fade-in duration-200"
          />
          <div
            className="absolute inset-x-0 top-16 bottom-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] border-t border-border bg-background px-4 py-3 space-y-1 animate-in slide-in-from-top-2 fade-in duration-200"
          >
            {NAV_LINKS.map((link) => {
              const key = link.to ?? link.href ?? link.label;
              const isActive = link.to ? pathname.startsWith(link.to) : false;
              const className = cn(
                "block px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/40",
              );
              if (link.href) {
                return (
                  <a
                    key={key}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={className}
                  >
                    {link.label}
                  </a>
                );
              }
              return (
                <Link
                  key={key}
                  to={link.to!}
                  onClick={() => setMenuOpen(false)}
                  className={className}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors sm:hidden"
            >
              Log in
            </Link>
          </div>
        </div>
      )}


      <main id="main-content">{children}</main>

      <footer className="border-t border-border bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <Link to="/" className="inline-block mb-3">
                <BrandLogo size="sm" />
              </Link>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[180px]">
                AI interview coaching, gov exam mock tests, and live practice for every career stage.
              </p>
              <div className="flex gap-3 mt-4">
                <a
                  href="https://twitter.com/clarifyai"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Twitter / X"
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
                >
                  <Twitter className="w-4 h-4" />
                </a>
                <a
                  href="https://github.com/clarifyai"
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
              <div key={col.heading}>
                <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3">
                  {col.heading}
                </p>
                <ul className="space-y-2.5">
                  {col.links
                    .map((link) => (
                    <li key={link.label}>
                      {"href" in link ? (
                        <a
                          href={link.href}
                          target={"external" in link && link.external ? "_blank" : undefined}
                          rel={"external" in link && link.external ? "noopener noreferrer" : undefined}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          to={link.to}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>&copy; {new Date().getFullYear()} {LEGAL_ENTITY_NAME}. All rights reserved.</span>
            <div className="flex gap-4 flex-wrap justify-center">
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link to="/help" className="hover:text-foreground transition-colors">Help</Link>
              <Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
              <Link to="/blog" className="hover:text-foreground transition-colors">Blog</Link>
              <Link to="/gov-exams" className="hover:text-foreground transition-colors">
                {PRODUCT_NAMES.govExams}
              </Link>
              <Link to="/shortcuts" className="hover:text-foreground transition-colors">Shortcuts</Link>
              <a href={STATUS_PAGE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Status</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
