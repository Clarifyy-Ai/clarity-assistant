import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
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

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/images/clarify-logo.png" alt="Clarify AI" className="h-8 w-auto" />
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
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:inline-block"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="text-sm font-semibold px-5 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {children}

      <footer className="border-t border-border py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Clarify AI. All rights reserved.</span>
          <div className="flex gap-6">
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
