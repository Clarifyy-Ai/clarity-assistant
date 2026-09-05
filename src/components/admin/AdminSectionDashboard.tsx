import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { AdminStatGrid, type AdminStatGridItem } from "@/components/admin/AdminStatGrid";
import { AdminQuickLinks, type AdminQuickLink } from "@/components/admin/AdminQuickLinks";
import { cn } from "@/lib/utils";

type AdminSectionDashboardProps = {
  stats: AdminStatGridItem[];
  loading?: boolean;
  columns?: 2 | 3 | 4 | 5;
  quickLinks?: AdminQuickLink[];
  quickLinksTitle?: string;
  activity?: ReactNode;
  activityTitle?: string;
  className?: string;
};

export function AdminSectionDashboard({
  stats,
  loading = false,
  columns = 4,
  quickLinks,
  quickLinksTitle,
  activity,
  activityTitle = "Recent activity",
  className,
}: AdminSectionDashboardProps) {
  const hasExtras = Boolean(quickLinks?.length || activity);

  return (
    <div className={cn("space-y-4", className)}>
      <AdminStatGrid stats={stats} loading={loading} columns={columns} />

      {hasExtras && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {quickLinks && quickLinks.length > 0 && (
            <Card className="p-4">
              <AdminQuickLinks links={quickLinks} title={quickLinksTitle} />
            </Card>
          )}
          {activity && (
            <Card className="p-4 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                {activityTitle}
              </p>
              {activity}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
