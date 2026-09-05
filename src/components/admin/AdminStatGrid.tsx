import { AdminStatCard, type AdminStatCardProps } from "@/components/admin/AdminStatCard";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { cn } from "@/lib/utils";

export type AdminStatGridItem = AdminStatCardProps & { id: string };

type AdminStatGridProps = {
  stats: AdminStatGridItem[];
  loading?: boolean;
  columns?: 2 | 3 | 4 | 5;
  className?: string;
  skeletonCount?: number;
};

const COL_CLASS: Record<NonNullable<AdminStatGridProps["columns"]>, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
};

export function AdminStatGrid({
  stats,
  loading = false,
  columns = 4,
  className,
  skeletonCount,
}: AdminStatGridProps) {
  const placeholders = skeletonCount ?? columns;

  if (loading) {
    return (
      <div className={cn("grid gap-3", COL_CLASS[columns], className)}>
        {Array.from({ length: placeholders }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (stats.length === 0) return null;

  return (
    <div className={cn("grid gap-3", COL_CLASS[columns], className)}>
      {stats.map((stat) => (
        <AdminStatCard key={stat.id} {...stat} />
      ))}
    </div>
  );
}
