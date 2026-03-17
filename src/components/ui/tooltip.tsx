import {
  useState, useRef, type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Tooltip
// Simple hover tooltip — no third-party dependency.
// ─────────────────────────────────────────────────────────────────

interface TooltipProps {
  content:    ReactNode;
  children:   ReactNode;
  side?:      "top" | "bottom" | "left" | "right";
  className?: string;
}

const SIDE_CLASSES = {
  top:    "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full  left-1/2 -translate-x-1/2 mt-2",
  left:   "right-full top-1/2 -translate-y-1/2 mr-2",
  right:  "left-full  top-1/2 -translate-y-1/2 ml-2",
};

export function Tooltip({
  content,
  children,
  side      = "top",
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    timerRef.current = setTimeout(() => setVisible(true), 300);
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <div
          className={cn(
            "absolute z-50 px-2.5 py-1.5 bg-[#1a1a2e] border border-white/15",
            "rounded-lg text-xs text-gray-200 whitespace-nowrap shadow-xl",
            "pointer-events-none animate-in fade-in duration-100",
            SIDE_CLASSES[side],
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
