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
    <div className={cn("space-y-4 mb-6 md:mb-8", className)}>
      {displayBreadcrumbs && displayBreadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs sm:text-sm" aria-label="Breadcrumb">
          {displayBreadcrumbs.map((breadcrumb, index) => (
            <div key={index} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mx-0.5" />
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
                    className="text-primary hover:text-primary/80 transition-colors duration-150"
                  >
                    {breadcrumb.label}
                  </Link>
                ) : (
                  <a
                    href={breadcrumb.href}
                    className="text-primary hover:text-primary/80 transition-colors duration-150"
                  >
                    {breadcrumb.label}
                  </a>
                )
              ) : (
                <span className="text-muted-foreground">{breadcrumb.label}</span>
              )}
            </div>
          ))}
        </nav>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          {icon && (
            <div className={cn(
              "mt-1 p-2 rounded-lg",
              stealth ? "bg-primary/10" : "bg-primary/10"
            )}>
              {icon}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
                {displayTitle}
              </h1>
              {badge && !stealth && (
                <span className="px-2 py-1 text-xs font-semibold bg-primary/15 text-primary rounded-full">
                  {badge}
                </span>
              )}
            </div>
            {resolvedDescription && (
              <p className="text-muted-foreground text-sm sm:text-base mt-1">
                {resolvedDescription}
              </p>
            )}
          </div>
        </div>

        {resolvedActions && (
          <div className="flex gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
            {resolvedActions}
          </div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
