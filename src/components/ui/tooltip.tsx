import {
  useState, useRef, type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Tooltip
// Simple hover tooltip — no third-party dependency.
// ─────────────────────────────────────────────────────────────────

export interface TooltipProps {
  content?:   ReactNode;
  children:   ReactNode;
  side?:      string;
  className?: string;
}

const SIDE_CLASSES: Record<string, string> = {
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
      {visible && content && (
        <div
          className={cn(
            "absolute z-50 px-2.5 py-1.5 bg-popover border border-border",
            "rounded-lg text-xs text-popover-foreground whitespace-nowrap shadow-xl",
            "pointer-events-none animate-in fade-in duration-100",
            SIDE_CLASSES[side] ?? SIDE_CLASSES.top,
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}

// Compat exports for shadcn sidebar component
export const TooltipProvider = ({ children, ..._props }: { children: React.ReactNode; delayDuration?: number }) => <>{children}</>;
export const TooltipTrigger = ({ children, ...props }: { children: React.ReactNode; asChild?: boolean }) => <span {...props}>{children}</span>;
export const TooltipContent = ({ children, ..._props }: { children: React.ReactNode; side?: string; align?: string; hidden?: boolean; [key: string]: any }) => <span>{children}</span>;
