// Single-glance mic/audio preflight status for Practice Coach start.
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, MicOff } from "lucide-react";
import { runAudioPreflight, type PreflightReport } from "@/lib/validators/audioValidator";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type BadgeState = "checking" | "ok" | "warn" | "denied" | "error";

export function AudioOkBadge({
  className,
  autoRun = true,
  onReady,
}: {
  className?: string;
  autoRun?: boolean;
  onReady?: (ready: boolean) => void;
}) {
  const [state, setState] = useState<BadgeState>("checking");
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [detail, setDetail] = useState<string>("");

  async function runCheck() {
    setState("checking");
    setDetail("");
    try {
      const perm = await navigator.permissions
        ?.query({ name: "microphone" as PermissionName })
        .catch(() => null);
      if (perm?.state === "denied") {
        setState("denied");
        onReady?.(false);
        setDetail("Microphone blocked — allow mic in browser settings, then retry.");
        return;
      }
      const result = await runAudioPreflight();
      setReport(result);
      if (result.ready) {
        setState(result.warnings.length ? "warn" : "ok");
        onReady?.(true);
        setDetail(
          result.warnings.length
            ? result.warnings[0]
            : "Microphone ready — you can start practice.",
        );
      } else {
        setState("error");
        onReady?.(false);
        setDetail(result.errors[0] ?? "Audio check failed — fix mic, then retry.");
      }
    } catch {
      setState("error");
      onReady?.(false);
      setDetail("Could not check microphone. Retry or open Settings → Audio.");
    }
  }

  useEffect(() => {
    if (!autoRun) return;
    void runCheck();
  }, [autoRun]);

  const styles: Record<BadgeState, string> = {
    checking: "border-border bg-secondary/40 text-muted-foreground",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    denied: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
    error: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  };

  const label =
    state === "checking"
      ? "Checking audio…"
      : state === "ok"
        ? "Audio OK"
        : state === "warn"
          ? "Audio OK (warnings)"
          : state === "denied"
            ? "Mic blocked"
            : "Audio needs fix";

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
      {report?.ready === false && report.errors.length > 1 && (
        <ul className="text-[11px] opacity-80 list-disc pl-4 space-y-0.5">
          {report.errors.slice(1, 3).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
