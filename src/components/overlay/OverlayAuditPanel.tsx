// src/components/overlay/OverlayAuditPanel.tsx
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import { useNetworkMonitor } from "@/hooks/useNetworkMonitor";
import {
  Wifi,
  WifiOff,
  Mic,
  Volume2,
  Zap,
  Clock,
  CreditCard,
  Brain,
  AlertTriangle,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TRANSCRIPTION_STATUS_COPY,
  providerStatusToTranscription,
} from "@/lib/audio/transcriptionStates";

export function OverlayAuditPanel() {
  const providerStatus = useAudioStore((s) => s.transcription_provider_status);
  const pipelineStatus = useAudioStore((s) => s.pipeline_status);
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const isMuted = useAudioStore((s) => s.is_muted);
  const hasSystemAudio = useAudioStore((s) => !!s.streams?.system_stream);
  const streamError = useAudioStore((s) => s.streams?.error ?? null);

  const elapsed = useSessionStore((s) => s.elapsed_seconds ?? 0);
  const credits = useSessionStore((s) => s.credits_consumed ?? 0);

  const activeModel = useOverlayStore((s) => s.active_model);
  const resumeCtx = useOverlayStore((s) => s.resume_context);
  const network = useNetworkMonitor();

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;

  const transcriptionState = providerStatusToTranscription(providerStatus, pipelineStatus);
  const sttLabel = TRANSCRIPTION_STATUS_COPY[transcriptionState];

  const sttColor =
    transcriptionState === "ready" ||
    transcriptionState === "transcribing" ||
    transcriptionState === "receiving_audio"
      ? "text-emerald-400"
      : transcriptionState === "connecting" ||
          transcriptionState === "reconnecting"
        ? "text-amber-400"
        : transcriptionState === "paused"
          ? "text-sky-400"
          : "text-red-400";

  const netColor =
    network.mode === "offline"
      ? "text-red-400"
      : network.overlayColor === "green"
      ? "text-emerald-400"
      : network.overlayColor === "yellow"
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div className="space-y-1.5 p-3">
      {streamError && (
        <div className="rounded-xl bg-red-500/8 border border-red-500/15 px-3 py-2.5 mb-2">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-[11px] font-bold text-red-400">
              {streamError.code?.replace(/_/g, " ") || "Stream error"}
            </span>
          </div>
          <p className="text-[12px] text-red-300/70">
            {streamError.message}
          </p>
        </div>
      )}

      <AuditRow
        icon={Clock}
        label="Session"
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
        label="Transcription"
        value={sttLabel}
        valueClass={sttColor}
      />
      <AuditRow
        icon={Mic}
        label="Microphone"
        value={
          !isCapturing ? "Not capturing" : isMuted ? "Muted" : "Active"
        }
        valueClass={
          !isCapturing
            ? "text-white/30"
            : isMuted
            ? "text-amber-400"
            : "text-emerald-400"
        }
      />
      <AuditRow
        icon={Volume2}
        label="System Audio"
        value={hasSystemAudio ? "Active" : "Off"}
        valueClass={hasSystemAudio ? "text-emerald-400" : "text-white/30"}
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
        value={
          resumeCtx
            ? `${resumeCtx.skills_count} skills · ${resumeCtx.experience_count} roles`
            : "Not loaded"
        }
        valueClass={resumeCtx ? "text-emerald-400" : "text-white/25"}
      />
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
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-white/20" />
        <span className="text-[12px] text-white/40">{label}</span>
      </div>
      <span className={cn("text-[12px] font-medium", valueClass)}>
        {value}
      </span>
    </div>
  );
}
