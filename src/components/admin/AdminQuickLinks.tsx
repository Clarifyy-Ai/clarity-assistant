import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminQuickLink = {
  id: string;
  to: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
};

type AdminQuickLinksProps = {
  links: AdminQuickLink[];
  className?: string;
  title?: string;
};

export function AdminQuickLinks({ links, className, title = "Quick navigation" }: AdminQuickLinksProps) {
  if (links.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {links.map((link) => (
          <Link
            key={link.id}
            to={link.to}
            className="group flex items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm hover:border-primary/30 hover:bg-accent/5 transition-all min-w-0"
          >
            <link.icon
              className={cn("w-4 h-4 shrink-0 mt-0.5", link.iconClassName ?? "text-primary")}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="font-medium text-foreground block truncate group-hover:text-primary transition-colors">
                {link.label}
              </span>
              {link.description && (
                <span className="text-[11px] text-muted-foreground line-clamp-2">{link.description}</span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
