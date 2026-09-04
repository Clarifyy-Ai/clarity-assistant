import { ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import { getStealthLabel } from "@/lib/stealth/stealthConfig";

function isInternalAppPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  /** @deprecated Alias for `description` */
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  /** @deprecated Alias for `actions` */
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
  badge?: string;
}

const MAX_BREADCRUMB_LEVELS = 4;

function truncateBreadcrumbs(
  breadcrumbs: Breadcrumb[],
  maxLevels: number,
): { display: Breadcrumb[]; hiddenLabels: string[] } {
  if (breadcrumbs.length <= maxLevels) {
    return { display: breadcrumbs, hiddenLabels: [] };
  }

  const tailCount = maxLevels - 2;
  const hidden = breadcrumbs.slice(1, -tailCount);

  return {
    display: [
      breadcrumbs[0],
      { label: "…" },
      ...breadcrumbs.slice(-tailCount),
    ],
    hiddenLabels: hidden.map((b) => b.label),
  };
}

export function PageHeader({
  title,
  description,
  subtitle,
  breadcrumbs,
  actions,
  action,
  className,
  icon,
  badge,
}: PageHeaderProps) {
  const resolvedDescription = description ?? subtitle;
  const resolvedActions = actions ?? action;
  const stealth = useUIStore((s) => s.stealth_mode);
  const displayTitle = getStealthLabel(title, stealth);

  const { displayBreadcrumbs, hiddenBreadcrumbLabels } = useMemo(() => {
    if (!breadcrumbs?.length) {
      return { displayBreadcrumbs: undefined, hiddenBreadcrumbLabels: [] as string[] };
    }

    const labeled = breadcrumbs.map((b) => ({
      ...b,
      label: getStealthLabel(b.label, stealth),
    }));

    const { display, hiddenLabels } = truncateBreadcrumbs(labeled, MAX_BREADCRUMB_LEVELS);
    return { displayBreadcrumbs: display, hiddenBreadcrumbLabels: hiddenLabels };
  }, [breadcrumbs, stealth]);

  return (
    <div
      data-testid="page-header"
      className={cn("space-y-4 mb-6 md:mb-8", className)}
    >
      {displayBreadcrumbs && displayBreadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs sm:text-sm min-w-0" aria-label="Breadcrumb">
          {displayBreadcrumbs.map((breadcrumb, index) => (
            <div key={index} className="flex items-center gap-1 min-w-0">
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mx-0.5 shrink-0" />
              )}
              {breadcrumb.label === "…" ? (
                <span
                  className="text-muted-foreground px-0.5"
                  title={hiddenBreadcrumbLabels.join(" › ")}
                  aria-label={`Hidden: ${hiddenBreadcrumbLabels.join(", ")}`}
                >
                  …
                </span>
              ) : breadcrumb.href ? (
                isInternalAppPath(breadcrumb.href) ? (
                  <Link
                    to={breadcrumb.href}
                    title={breadcrumb.label}
                    className="text-primary hover:text-primary/80 transition-colors duration-150 min-w-0 truncate"
                  >
                    {breadcrumb.label}
                  </Link>
                ) : (
                  <a
                    href={breadcrumb.href}
                    title={breadcrumb.label}
                    className="text-primary hover:text-primary/80 transition-colors duration-150 min-w-0 truncate"
                  >
                    {breadcrumb.label}
                  </a>
                )
              ) : (
                <span
                  title={breadcrumb.label}
                  className="text-muted-foreground min-w-0 truncate"
                >
                  {breadcrumb.label}
                </span>
              )}
            </div>
          ))}
        </nav>
      )}

      <div
        data-testid="page-header-main"
        className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4"
      >
        <div
          data-testid="page-header-info"
          className="flex items-start gap-3 flex-1 min-w-0"
        >
          {icon && (
            <div className={cn(
              "mt-1 p-2 rounded-lg shrink-0",
              stealth ? "bg-primary/10" : "bg-primary/10"
            )}>
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 min-w-0">
              <h1
                data-testid="page-header-title"
                title={displayTitle}
                className="min-w-0 max-w-full flex-1 text-2xl sm:text-3xl md:text-4xl font-bold text-foreground leading-tight break-words [overflow-wrap:anywhere] line-clamp-2"
              >
                {displayTitle}
              </h1>
              {badge && !stealth && (
                <span className="mt-1 px-2 py-1 text-xs font-semibold bg-primary/15 text-primary rounded-full shrink-0">
                  {badge}
                </span>
              )}
            </div>
            {resolvedDescription && (
              <p className="text-muted-foreground text-sm sm:text-base mt-1 break-words [overflow-wrap:anywhere] leading-relaxed">
                {resolvedDescription}
              </p>
            )}
          </div>
        </div>

        {resolvedActions && (
          <div
            data-testid="page-header-actions"
            className="flex w-full md:w-auto gap-2 shrink-0 flex-wrap justify-start md:justify-end"
          >
            {resolvedActions}
          </div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
