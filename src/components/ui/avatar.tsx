import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Avatar
// User avatar with image fallback → initials fallback.
// ─────────────────────────────────────────────────────────────────

interface AvatarProps {
  src?:       string | null;
  name?:      string | null;
  size?:      "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  online?:    boolean;
}

const SIZES = {
  xs: "w-5 h-5  text-[9px]",
  sm: "w-7 h-7  text-xs",
  md: "w-9 h-9  text-sm",
  lg: "w-11 h-11 text-base",
  xl: "w-16 h-16 text-xl",
};

const COLORS = [
  "bg-violet-700", "bg-blue-700", "bg-emerald-700",
  "bg-pink-700",   "bg-amber-700","bg-cyan-700",
];

function colorFromName(name: string): string {
  const sum = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[sum % COLORS.length];
}

export function Avatar({ src, name, size = "md", className, online }: AvatarProps) {
  const initials = name
    ? name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const bg = name ? colorFromName(name) : "bg-gray-700";

  return (
    <div className={cn("relative inline-flex shrink-0", SIZES[size], className)}>
      {src ? (
        <img
          src={src}
          alt={name ?? "User"}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <div className={cn(
          "w-full h-full rounded-full flex items-center justify-center text-white font-bold",
          bg
        )}>
          {initials}
        </div>
      )}
      {online !== undefined && (
        <span className={cn(
          "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#0a0a0f]",
          online ? "bg-emerald-400" : "bg-gray-600"
        )} />
      )}
    </div>
  );
}
