import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";
import { Wifi, WifiOff, Mic, Volume2, Zap, Clock, CreditCard, Brain, AlertTriangle, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function OverlayAuditPanel() {
  const deepgramStatus   = useAudioStore((s) => s.deepgram_status);
  const isCapturing      = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isMuted          = useAudioStore((s) => s.is_muted);
  const hasSystemAudio   = useAudioStore((s) => !!s.streams?.system_stream);
  const streamError      = useAudioStore((s) => s.streams?.error ?? null);
  const elapsed          = useSessionStore((s) => s.elapsed_seconds);
  const credits          = useSessionStore((s) => s.credits_consumed);
  const activeModel      = useOverlayStore((s) => s.active_model);
  const resumeCtx        = useOverlayStore((s) => s.resume_context);
  const network          = useNetworkMonitor();

  const minutes  = Math.floor(elapsed / 60);
  const seconds  = elapsed % 60;
  const timeStr  = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const sttLabel =
    deepgramStatus === "connected"    ? "Connected" :
    deepgramStatus === "connecting"   ? "Connecting…" :
    deepgramStatus === "reconnecting" ? "Reconnecting…" :
    deepgramStatus === "error"        ? "Error" : "Disconnected";

  const sttColor =
    deepgramStatus === "connected" ? "text-green-400" :
    deepgramStatus === "connecting" || deepgramStatus === "reconnecting" ? "text-amber-400" :
    "text-red-400";

  const netColor =
    network.mode === "offline" ? "text-red-400" :
    network.overlayColor === "green" ? "text-green-400" :
    network.overlayColor === "yellow" ? "text-amber-400" : "text-red-400";

  return (
    <div className="space-y-2 p-3">
      {streamError && (
        <div className="rounded-lg bg-destructive/10 px-2.5 py-2 mb-1">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
            <span className="text-xs font-semibold text-red-400">{streamError.code?.replace(/_/g, " ")}</span>
          </div>
          <p className="text-xs text-red-300/80 leading-relaxed">{streamError.message}</p>
          {streamError.suggestion && (
            <p className="text-xs text-muted-foreground/60 mt-1">{streamError.suggestion}</p>
          )}
        </div>
      )}

      <AuditRow
        icon={Clock}
        label="Session Duration"
        value={timeStr}
        valueClass="text-white font-mono"
      />
      <AuditRow
        icon={network.mode === "offline" ? WifiOff : Wifi}
        label="Network"
        value={network.qualityLabel}
        valueClass={netColor}
      />
      <AuditRow
        icon={Zap}
        label="Speech-to-Text"
        value={sttLabel}
        valueClass={sttColor}
      />
      <AuditRow
        icon={Mic}
        label="Microphone"
        value={!isCapturing ? "Not capturing" : isMuted ? "Muted" : "Active"}
        valueClass={!isCapturing ? "text-gray-500" : isMuted ? "text-amber-400" : "text-green-400"}
      />
      <AuditRow
        icon={Volume2}
        label="System Audio"
        value={hasSystemAudio ? "Active" : "Off"}
        valueClass={hasSystemAudio ? "text-emerald-400" : "text-gray-500"}
      />
      <AuditRow
        icon={Brain}
        label="AI Model"
        value={activeModel}
        valueClass="text-white"
      />
      <AuditRow
        icon={CreditCard}
        label="Credits Used"
        value={String(credits)}
        valueClass="text-white"
      />
      <AuditRow
        icon={FileText}
        label="Resume"
        value={resumeCtx ? `${resumeCtx.skills_count} skills · ${resumeCtx.experience_count} roles` : "Not loaded"}
        valueClass={resumeCtx ? "text-green-400" : "text-gray-500"}
      />
      {resumeCtx?.top_skills && resumeCtx.top_skills.length > 0 && (
        <div className="mt-1 pl-[18px]">
          <p className="text-[11px] text-muted-foreground/40 truncate">
            {resumeCtx.top_skills.slice(0, 5).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

function AuditRow({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground/60">{label}</span>
      </div>
      <span className={cn("text-xs font-medium", valueClass)}>{value}</span>
    </div>
  );
}
