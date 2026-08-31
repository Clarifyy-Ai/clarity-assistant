import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pins the settings save control so it cannot scroll off-screen. */
export function SettingsSaveBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="settings-save-bar"
      className={cn(
        "sticky bottom-0 z-20 -mx-1 mt-6 border-t border-border bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
    >
      {children}
    </div>
  );
}
