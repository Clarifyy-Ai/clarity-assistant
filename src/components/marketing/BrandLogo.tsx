import { useState } from "react";
import { cn } from "@/lib/utils";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

interface BrandLogoProps {
  className?: string;
  iconClassName?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  /** Web and desktop share one Career Pilot mark. */
  variant?: "web" | "app" | "auto";
}

const SIZES = {
  sm: { icon: "h-8 w-8", text: "text-base" },
  md: { icon: "h-10 w-10", text: "text-lg" },
  lg: { icon: "h-12 w-12", text: "text-xl" },
};

export function BrandLogo({
  className,
  iconClassName,
  showText = true,
  size = "md",
}: BrandLogoProps) {
  const s = SIZES[size];
  const src = "/brand/logo-192.png";
  const alt = PRODUCT_NAMES.brand;
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span className={cn("inline-flex items-center gap-2.5 min-w-0", className)}>
      {imageFailed ? (
        <span
          role="img"
          aria-label={alt}
          className={cn(
            "shrink-0 rounded-xl bg-gradient-to-br from-sky-blue to-electric-blue shadow-lg shadow-primary/20 ring-1 ring-white/10",
            s.icon,
            iconClassName,
          )}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          width={48}
          height={48}
          decoding="async"
          onError={() => setImageFailed(true)}
          className={cn(
            "shrink-0 rounded-xl object-cover shadow-lg shadow-primary/20 ring-1 ring-white/10",
            s.icon,
            iconClassName,
          )}
        />
      )}
      {showText && (
        <span className={cn("font-bold tracking-tight text-foreground truncate", s.text)}>
          Career <span className="text-primary">Pilot</span>
        </span>
      )}
    </span>
  );
}
