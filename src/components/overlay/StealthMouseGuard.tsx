import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────
// StealthMouseGuard
// Wraps overlay content with a data-stealth-active attribute for
// CSS-based capture evasion selectors. Interaction (clicks, drag,
// resize) remains fully enabled in stealth mode.
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
