import { cn } from "@/lib/utils";
import { Mic } from "lucide-react";
interface BrandLogoProps {
  className?: string;
  iconClassName?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: { icon: "h-8 w-8", text: "text-base", mic: "h-4 w-4" },
  md: { icon: "h-10 w-10", text: "text-lg", mic: "h-5 w-5" },
  lg: { icon: "h-12 w-12", text: "text-xl", mic: "h-6 w-6" },
};

export function BrandLogo({
  className,
  iconClassName,
  showText = true,
  size = "md",
}: BrandLogoProps) {
  const s = SIZES[size];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-700 shadow-lg shadow-primary/20",
          s.icon,
          iconClassName,
        )}
      >
        <Mic className={cn("text-white", s.mic)} />
      </span>
      {showText && (
        <span className={cn("font-bold tracking-tight text-foreground", s.text)}>
          Clarify<span className="text-primary"> AI</span>
        </span>
      )}    </span>
  );
}
