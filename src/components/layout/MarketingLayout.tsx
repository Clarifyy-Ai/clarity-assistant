import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { to: "/pricing", label: "Pricing" },
  { to: "/blog", label: "Blog" },
  { to: "/help", label: "Help" },
];

const FOOTER_LINKS = [
  { to: "/pricing", label: "Pricing" },
  { to: "/help", label: "Help" },
  { to: "/shortcuts", label: "Shortcuts" },
  { to: "/blog", label: "Blog" },
];

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export function MarketingLayout({ children }: MarketingLayoutProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/images/clarify-logo.png" alt="Clarify AI" className="h-10 sm:h-12 w-auto" />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "transition-colors",
                    isActive ? "text-foreground" : "hover:text-foreground"
                  )}
                >
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

        {menuOpen && (
          <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl px-4 py-3 space-y-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname.startsWith(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "block px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                  )}
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
        )}
      </nav>

      {children}

      <footer className="border-t border-border py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Payara Labs. All rights reserved.</span>
          <div className="flex gap-4 sm:gap-6 flex-wrap justify-center">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
