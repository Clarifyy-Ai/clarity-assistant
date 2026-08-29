import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsPageShellProps {
  title: string;
  description?: string;
  /** Alias for description — retained for older settings pages. */
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

/** Consistent section header for settings sub-pages (below layout PageHeader). */
export function SettingsPageShell({
  title,
  description,
  subtitle,
  children,
  className,
}: SettingsPageShellProps) {
  const copy = description ?? subtitle;
  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {copy && (
          <p className="text-sm text-muted-foreground mt-1">{copy}</p>
        )}
      </div>
      {children}
    </div>
  );
}
