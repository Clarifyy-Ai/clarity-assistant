// ✅ FIX P4-B: Small lifecycle + reconnect indicator for call sessions.

import { cn } from "@/lib/utils";
import type { CallSessionLifecycle } from "@/hooks/useCallSession";

export function CallSessionLifecycleBanner({
  lifecycle,
  isReconnecting,
}: {
  lifecycle: CallSessionLifecycle;
  isReconnecting?: boolean;
}) {
  const dotColor =
    lifecycle === "live"
      ? "bg-emerald-500"
      : lifecycle === "initialising" || lifecycle === "ending"
        ? "bg-amber-500 animate-pulse"
        : lifecycle === "ended"
          ? "bg-muted-foreground"
          : "bg-blue-500";

  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-border bg-card/80 px-3 py-2 text-xs"
      role="status"
      aria-live="polite"
    >
      <span className={cn("h-2 w-2 rounded-full shrink-0", dotColor)} />
      <span className="font-semibold capitalize text-foreground">{lifecycle}</span>
      {isReconnecting && (
        <span className="text-muted-foreground ml-auto">Reconnecting audio…</span>
      )}
    </div>
  );
}
