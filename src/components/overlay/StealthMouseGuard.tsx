import type { ReactNode } from "react";

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
      className="no-select"
      data-stealth-active={isActive ? "true" : "false"}
    >
      {children}
    </div>
  );
}
