import { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// PageHeader
// Consistent page title + optional subtitle + optional action area.
// ─────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between mb-6", className)}>
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-gray-400">{subtitle}</p>
        )}
      </div>

      {action && <div className="ml-4 shrink-0">{action}</div>}
    </div>
  );
}
