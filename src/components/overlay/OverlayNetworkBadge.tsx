import { cn } from "@/lib/utils";

interface OverlayNetworkBadgeProps {
  color: "green" | "yellow" | "red";
}

export function OverlayNetworkBadge({ color }: OverlayNetworkBadgeProps) {
  return (
    <span
      className={cn(
        "net-dot",
        color === "green" && "net-dot-green",
        color === "yellow" && "net-dot-yellow",
        color === "red" && "net-dot-red"
      )}
      title={
        color === "green" ? "Strong connection" :
        color === "yellow" ? "Degraded — using faster model" :
        "Offline — using templates"
      }
    />
  );
}
