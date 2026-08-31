import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/constants/contact";
import { cn } from "@/lib/utils";

interface PublicErrorStateProps {
  title: string;
  description: string;
  homeHref?: string;
  homeLabel?: string;
  supportHref?: string;
  className?: string;
}

/** Accessible public-page error for invalid/expired/revoked share links. */
export function PublicErrorState({
  title,
  description,
  homeHref = "/",
  homeLabel = "Return home",
  supportHref = `mailto:${SUPPORT_EMAIL}`,
  className,
}: PublicErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "mx-auto flex min-h-0 max-w-md flex-col items-center justify-center px-4 py-8 text-center space-y-4",
        className,
      )}
    >
      <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-amber-500" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Link
          to={homeHref}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 min-h-10"
        >
          {homeLabel}
        </Link>
        <a
          href={supportHref}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 min-h-10"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
