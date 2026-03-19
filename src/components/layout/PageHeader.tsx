import { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PageHeader Component
 * Displays page title, breadcrumbs, and action buttons
 * 
 * Usage:
 * ```
 * <PageHeader
 *   title="Mock Interview"
 *   description="Practice your interview skills"
 *   breadcrumbs={[
 *     { label: "Home", href: "/app" },
 *     { label: "Mock Interview" }
 *   ]}
 *   actions={<Button>Start Interview</Button>}
 * />
 * ```
 */

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  className?: string;
  icon?: ReactNode;
  badge?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
  icon,
  badge,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-4 mb-6 md:mb-8", className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs sm:text-sm">
          {breadcrumbs.map((breadcrumb, index) => (
            <div key={index} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 mx-0.5" />
              )}
              {breadcrumb.href ? (
                <a
                  href={breadcrumb.href}
                  className="text-blue-400 hover:text-blue-300 transition"
                >
                  {breadcrumb.label}
                </a>
              ) : (
                <span className="text-gray-400">{breadcrumb.label}</span>
              )}
            </div>
          ))}
        </nav>
      )}

      {/* Title Section */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          {icon && (
            <div className="mt-1 p-2 bg-violet-500/10 rounded-lg">
              {icon}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white">
                {title}
              </h1>
              {badge && (
                <span className="px-2 py-1 text-xs font-semibold bg-violet-500/20 text-violet-300 rounded-full">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="text-gray-400 text-sm sm:text-base mt-1">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
