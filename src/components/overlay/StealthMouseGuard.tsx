import { type ReactNode, useEffect, useRef, useState } from "react";

interface StealthMouseGuardProps {
  /** When true the overlay enters stealth — reduced opacity, no pointer events on outer shell */
  isActive: boolean;
  /** 0–1 — opacity when stealth is active (default 0.15) */
  stealthOpacity?: number;
  /** Milliseconds to wait after mouse-enter before restoring full visibility (default 0 = instant) */
  hoverRevealDelayMs?: number;
  children: ReactNode;
}

/**
 * StealthMouseGuard
 *
 * In stealth mode the wrapper becomes nearly transparent.
 * Hovering over it immediately (or after `hoverRevealDelayMs`) shows it
 * fully so the user can interact, then it fades back on mouse-leave.
 *
 * Pointer-events are always kept on so the user can still click through,
 * but the outer shell forwards the `data-stealth-active` attribute for
 * any CSS selectors that need to know about stealth state.
 */
export function StealthMouseGuard({
  isActive,
  stealthOpacity    = 0.15,
  hoverRevealDelayMs = 0,
  children,
}: StealthMouseGuardProps) {
  const [isHovering, setIsHovering]  = useState(false);
  const revealTimerRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef                      = useRef<HTMLDivElement>(null);

  /* ── keyboard reveal: pressing ⌃⇧S while stealth is on briefly shows the overlay */
  useEffect(() => {
    if (!isActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
        setIsHovering(true);
        if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
        revealTimerRef.current = setTimeout(() => setIsHovering(false), 2500);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isActive]);

  /* Reset hover state when stealth is deactivated */
  useEffect(() => {
    if (!isActive) {
      setIsHovering(false);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    }
  }, [isActive]);

  function handleMouseEnter() {
    if (!isActive) return;
    if (hoverRevealDelayMs > 0) {
      revealTimerRef.current = setTimeout(() => setIsHovering(true), hoverRevealDelayMs);
    } else {
      setIsHovering(true);
    }
  }

  function handleMouseLeave() {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    setIsHovering(false);
  }

  /*
   * Derived opacity:
   * - stealth off  → 1 (fully visible, no transition needed)
   * - stealth on + hovering → 1 (revealed)
   * - stealth on + idle     → stealthOpacity
   */
  const opacity = !isActive ? 1 : isHovering ? 1 : stealthOpacity;

  return (
    <div
      ref={wrapRef}
      data-stealth-active={isActive ? "true" : "false"}
      data-stealth-revealed={isHovering ? "true" : "false"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        pointerEvents: "auto",
        opacity,
        transition: isActive
          ? isHovering
            ? "opacity 150ms ease"          // fast reveal
            : "opacity 600ms ease"          // slow fade back into stealth
          : "opacity 200ms ease",
        willChange: "opacity",
        position: "relative",
      }}
    >
      {/* Stealth-mode active indicator — tiny pulsing dot top-right */}
      {isActive && (
        <span
          aria-hidden="true"
          style={{
            position:  "absolute",
            top:        6,
            right:      6,
            width:      5,
            height:     5,
            borderRadius: "50%",
            background: isHovering ? "#6EE7B7" : "#F87171",
            boxShadow:  isHovering
              ? "0 0 6px 2px rgba(110,231,183,0.6)"
              : "0 0 6px 2px rgba(248,113,113,0.5)",
            animation: "stealth-pulse 2s ease-in-out infinite",
            zIndex: 9999,
            pointerEvents: "none",
            transition: "background 300ms, box-shadow 300ms",
          }}
        />
      )}

      <style>{`
        @keyframes stealth-pulse {
          0%,100% { transform: scale(1);   opacity: 1;   }
          50%      { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>

      {children}
    </div>
  );
}
