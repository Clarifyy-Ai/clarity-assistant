import { useState } from "react";
import { cn } from "@/lib/utils";
import { isElectronApp } from "@/lib/platform/isElectron";

interface BrandLogoProps {
  className?: string;
  iconClassName?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  /** Web brand mark (crystal) vs installed-app mark (coach reticle). */
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
  variant = "auto",
}: BrandLogoProps) {
  const s = SIZES[size];
  const isApp =
    variant === "app" || (variant === "auto" && typeof window !== "undefined" && isElectronApp());
  const src = isApp ? "/brand/app-icon-192.png" : "/brand/logo-192.png";
  const alt = isApp ? "Clarify Coach" : "Clarify AI";
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {imageFailed ? (
        <span
          role="img"
          aria-label={alt}
          className={cn(
            "shrink-0 rounded-xl bg-gradient-to-br from-cyan-500 to-primary shadow-lg shadow-cyan-500/15 ring-1 ring-white/10",
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
            "shrink-0 rounded-xl object-cover shadow-lg shadow-cyan-500/15 ring-1 ring-white/10",
            s.icon,
            iconClassName,
          )}
        />
      )}
      {showText && (
        <span className={cn("font-bold tracking-tight text-foreground", s.text)}>
          {isApp ? (
            <>
              Clarify<span className="text-cyan-500"> Coach</span>
            </>
          ) : (
            <>
              Clarify<span className="text-primary"> AI</span>
            </>
          )}
        </span>
      )}
    </span>
  );
}
