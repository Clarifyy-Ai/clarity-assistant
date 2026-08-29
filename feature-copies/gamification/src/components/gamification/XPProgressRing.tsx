import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface XPProgressRingProps {
  percent: number;
  level: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function XPProgressRing({
  percent,
  level,
  size = 72,
  strokeWidth = 6,
  className,
}: XPProgressRingProps) {
  const prevLevelRef = useRef(level);
  const [displayPercent, setDisplayPercent] = useState(percent);
  const [transitionMs, setTransitionMs] = useState(500);

  useEffect(() => {
    if (level > prevLevelRef.current) {
      setTransitionMs(400);
      setDisplayPercent(100);
      const timer = window.setTimeout(() => {
        setTransitionMs(0);
        setDisplayPercent(0);
        requestAnimationFrame(() => {
          setTransitionMs(500);
          setDisplayPercent(percent);
        });
        prevLevelRef.current = level;
      }, 450);
      return () => window.clearTimeout(timer);
    }

    prevLevelRef.current = level;
    setDisplayPercent(percent);
  }, [percent, level]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayPercent / 100) * circumference;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      aria-label={`Level ${level}, ${Math.round(displayPercent)}% progress to next level`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-primary transition-[stroke-dashoffset]"
          style={{ transitionDuration: `${transitionMs}ms` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-black text-foreground">{level}</span>
      </div>
    </div>
  );
}
