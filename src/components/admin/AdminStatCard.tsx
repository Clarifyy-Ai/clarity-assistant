import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminStatCardProps = {
  label: string;
  value: string;
  description?: string;
  icon?: LucideIcon;
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
};

const ICON_VARIANT: Record<NonNullable<AdminStatCardProps["variant"]>, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
};

function StatCardBody({
  label,
  value,
  description,
  icon: Icon,
  variant = "default",
}: AdminStatCardProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-foreground mt-1 tabular-nums">{value}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
        )}
      </div>
      {Icon && (
        <div
          className={cn(
            "h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shrink-0",
            ICON_VARIANT[variant],
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

export function AdminStatCard(props: AdminStatCardProps) {
  const { href, onClick, active, className, label } = props;
  const interactive = Boolean(href || onClick);
  const cardClass = cn(
    "p-4 sm:p-5",
    interactive && "cursor-pointer hover:border-primary/30 hover:bg-accent/5 transition-all",
    active && "border-primary/40 ring-1 ring-primary/20 bg-primary/[0.03]",
    className,
  );

  if (href) {
    return (
      <Link to={href} className="block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={label}>
        <Card className={cardClass}>
          <StatCardBody {...props} />
        </Card>
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block min-w-0 w-full text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={label}
        aria-pressed={active}
      >
        <Card className={cardClass}>
          <StatCardBody {...props} />
        </Card>
      </button>
    );
  }

  return (
    <Card className={cardClass}>
      <StatCardBody {...props} />
    </Card>
  );
}
