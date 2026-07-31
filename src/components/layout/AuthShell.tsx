import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/marketing";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Sparkles, TrendingUp, Users } from "lucide-react";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

type AuthShellProps = {
  children: ReactNode;
  /** Optional mobile brand strip title */
  mobileTitle?: string;
  testimonial?: {
    quote: string;
    author: string;
    role: string;
  };
};

const DEFAULT_TESTIMONIAL = {
  quote:
    "Clarify AI helped me land offers at 3 FAANG companies. The mock interviews are incredibly realistic.",
  author: "Sarah K.",
  role: "Senior Engineer at Google",
};

/**
 * Shared auth chrome for Login / Signup / Verify / Reset.
 * Left brand panel on lg+; form column on the right.
 */
export function AuthShell({
  children,
  mobileTitle = "Clarify AI",
  testimonial = DEFAULT_TESTIMONIAL,
}: AuthShellProps) {
  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col relative overflow-hidden bg-gradient-to-br from-primary via-indigo-600 to-blue-700 p-10">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,white,transparent_45%)]" />
        <div className="relative z-10 flex items-center gap-3">
          <BrandLogo size="md" showText={false} />
          <span className="text-lg font-bold text-white">Clarify AI</span>
        </div>
        <div className="relative z-10 flex-1 flex flex-col justify-center gap-8 max-w-md">
          <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
            Practice interviews with an AI coach that feels real.
          </h1>
          <ul className="space-y-3 text-sm text-white/90">
            <li className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" aria-hidden />
              {PRODUCT_NAMES.practiceCoach}
            </li>
            <li className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 shrink-0" aria-hidden />
              Scorecards and Skills Analytics
            </li>
            <li className="flex items-center gap-2">
              <Users className="w-4 h-4 shrink-0" aria-hidden />
              Prep Lab and Mock Interviews
            </li>
          </ul>
          <blockquote className="rounded-2xl bg-white/10 border border-white/20 p-4 text-sm text-white/95">
            <p className="leading-relaxed">&ldquo;{testimonial.quote}&rdquo;</p>
            <footer className="mt-3 text-xs text-white/70">
              {testimonial.author} · {testimonial.role}
            </footer>
          </blockquote>
        </div>
        <p className="relative z-10 text-xs text-white/60">
          Practice only — not for covert use in real interviews.
        </p>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border lg:border-0">
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <BrandLogo size="sm" showText={false} />
            <span className="text-sm font-semibold text-foreground">{mobileTitle}</span>
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
