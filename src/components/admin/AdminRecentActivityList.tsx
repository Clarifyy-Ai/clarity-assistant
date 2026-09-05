import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type AdminRecentItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  href?: string;
  onClick?: () => void;
  badge?: string;
  badgeVariant?: "default" | "success" | "warning" | "danger";
};

const BADGE_CLASS: Record<NonNullable<AdminRecentItem["badgeVariant"]>, string> = {
  default: "bg-secondary text-muted-foreground",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
};

type AdminRecentActivityListProps = {
  items: AdminRecentItem[];
  emptyMessage?: string;
};

function RecentRow({ item }: { item: AdminRecentItem }) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
        {item.subtitle && (
          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {item.badge && (
          <span
            className={cn(
              "inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mb-0.5",
              BADGE_CLASS[item.badgeVariant ?? "default"],
            )}
          >
            {item.badge}
          </span>
        )}
        {item.meta && <p className="text-[10px] text-muted-foreground whitespace-nowrap">{item.meta}</p>}
      </div>
    </>
  );

  const rowClass =
    "flex items-center gap-3 py-2 border-b border-border/60 last:border-0 hover:bg-accent/5 -mx-1 px-1 rounded-lg transition-colors";

  if (item.href) {
    return (
      <Link to={item.href} className={cn(rowClass, "block")}>
        {content}
      </Link>
    );
  }

  if (item.onClick) {
    return (
      <button type="button" onClick={item.onClick} className={cn(rowClass, "w-full text-left")}>
        {content}
      </button>
    );
  }

  return <div className={rowClass}>{content}</div>;
}

export function AdminRecentActivityList({ items, emptyMessage = "No recent activity." }: AdminRecentActivityListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="min-w-0">
      {items.map((item) => (
        <RecentRow key={item.id} item={item} />
      ))}
    </div>
  );
}
