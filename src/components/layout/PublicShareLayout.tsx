import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandLogo } from "@/components/marketing";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { PUBLIC_CTAS } from "@/lib/constants/publicCtas";
import { LEGAL_ENTITY_NAME } from "@/lib/constants/contact";

/** Slim public shell for shared links — one signup CTA in the header only. */
export function PublicShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${PRODUCT_NAMES.brand} home`}
          >
            <BrandLogo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/help"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
            >
              {PUBLIC_CTAS.help}
            </Link>
            <ThemeToggle />
            <Link
              to="/signup"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 whitespace-nowrap"
            >
              {PUBLIC_CTAS.signup}
            </Link>
          </div>
        </div>
      </header>
      <main id="main-content" className="flex-1 min-h-0">
        {children}
      </main>
      <footer className="border-t border-border py-6 px-4 text-center">
        <p className="text-xs text-muted-foreground">
          Shared via {PRODUCT_NAMES.brand} — practice-only interview coaching. &copy;{" "}
          {new Date().getFullYear()} {LEGAL_ENTITY_NAME}.
        </p>
      </footer>
    </div>
  );
}
