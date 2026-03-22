import type { ReactNode } from "react";

interface StealthMouseGuardProps {
  isActive: boolean;
  children: ReactNode;
}

export function StealthMouseGuard({ isActive, children }: StealthMouseGuardProps) {
  return (
    <div
      style={{ pointerEvents: "auto" }}
      data-stealth-active={isActive ? "true" : "false"}
    >
      {children}
    </div>
  );
}
