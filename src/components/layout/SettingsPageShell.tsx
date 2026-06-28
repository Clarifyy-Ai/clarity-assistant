import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsPageShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Consistent section header for settings sub-pages (below layout PageHeader). */
export function SettingsPageShell({
  title,
  description,
  children,
  className,
}: SettingsPageShellProps) {
  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
