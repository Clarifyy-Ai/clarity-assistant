// Single-glance microphone preflight. Local hardware only — STT is not this badge.
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { runLocalMicCheck } from "@/lib/audio/localMicPrecheck";
import {
  MIC_PERMISSION_RECOVERY,
  MIC_STATUS_COPY,
  MicState,
  createOperationGuard,
} from "@/lib/audio/precheckStates";
import { loadPersistedMicDeviceId } from "@/lib/audio/micDevicePersistence";

type BadgeState = "checking" | "ok" | "warn" | "denied" | "error";

function badgeFromMic(state: MicState): BadgeState {
  if (state === MicState.CHECKING || state === MicState.NOT_CHECKED) return "checking";
  if (state === MicState.READY) return "ok";
  if (state === MicState.NO_SIGNAL) return "warn";
  if (state === MicState.PERMISSION_DENIED) return "denied";
  return "error";
}

export function AudioOkBadge({
  className,
  autoRun = true,
  onReady,
}: {
  className?: string;
  autoRun?: boolean;
  onReady?: (ready: boolean) => void;
}) {
  const [micState, setMicState] = useState<MicState>(MicState.CHECKING);
  const [detail, setDetail] = useState("");
  const guardRef = useRef(createOperationGuard());
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  async function runCheck() {
    const op = guardRef.current.next();
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setMicState(MicState.CHECKING);
    setDetail("");
    try {
      const result = await runLocalMicCheck({
        deviceId: loadPersistedMicDeviceId(),
        signal: ac.signal,
      });
      if (!mountedRef.current || !op.isCurrent()) return;
      setMicState(result.state);
      onReady?.(result.state === MicState.READY);
      if (result.state === MicState.PERMISSION_DENIED) {
        setDetail(MIC_PERMISSION_RECOVERY);
      } else if (result.state === MicState.NO_SIGNAL) {
        setDetail("Speak near the microphone, then Recheck. This is not a transcription-service failure.");
      } else if (result.state === MicState.READY) {
        setDetail("Microphone ready — you can start practice.");
      } else {
        setDetail(result.error ?? MIC_STATUS_COPY[result.state]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!mountedRef.current || !op.isCurrent()) return;
      setMicState(MicState.ERROR);
      onReady?.(false);
      setDetail("Could not check microphone. Retry or open Settings → Audio.");
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    const guard = guardRef.current;
    if (autoRun) void runCheck();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      guard.invalidate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-run once on mount
  }, [autoRun]);

  const state = badgeFromMic(micState);
  const styles: Record<BadgeState, string> = {
    checking: "border-border bg-secondary/40 text-muted-foreground",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    denied: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
    error: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  };

  const label = MIC_STATUS_COPY[micState === MicState.NOT_CHECKED ? MicState.CHECKING : micState];

  return (
    <div className={cn("rounded-xl border px-3 py-2.5 space-y-1.5 w-fit max-w-full", styles[state], className)}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold" role="status" aria-live="polite">
          {state === "checking" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {state === "ok" && <CheckCircle2 className="w-4 h-4" aria-hidden />}
          {state === "warn" && <AlertCircle className="w-4 h-4" aria-hidden />}
          {(state === "denied" || state === "error") && <MicOff className="w-4 h-4" aria-hidden />}
          {label}
        </div>
        {state !== "checking" && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void runCheck()}>
            Recheck
          </Button>
        )}
      </div>
      {detail && <p className="text-xs opacity-90 leading-snug">{detail}</p>}
    </div>
  );
}
