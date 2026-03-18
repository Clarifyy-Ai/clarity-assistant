import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// StealthMouseGuard
// Wraps overlay content. When stealth is active:
//   - pointer-events: none (cursor passes through)
//   - user-select: none
//   - No mouse event listeners fire inside
// ─────────────────────────────────────────────────────────────────

interface StealthMouseGuardProps {
  isActive: boolean;
  children: ReactNode;
}

export function StealthMouseGuard({ isActive, children }: StealthMouseGuardProps) {
  return (
    <div
      className={cn(
        "no-select",
        isActive && "pointer-events-none"
      )}
      data-stealth-active={isActive ? "true" : "false"}
    >
      {children}
    </div>
  );
}
