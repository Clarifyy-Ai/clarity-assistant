// src/components/overlay/OverlayListeningIndicator.tsx
import { memo } from "react";
import { MicOff, AlertCircle, Pause } from "lucide-react";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import { useOverlayStore } from "@/store/overlayStore";
import {
  overlayStateLabel,
  overlayStateRecovery,
  type OverlaySessionState,
} from "@/lib/overlay/overlaySessionStates";
import { cn } from "@/lib/utils";

type ListeningState = "listening" | "paused" | "muted" | "error" | "idle" | "busy";

const ERROR_PIPELINE: OverlaySessionState[] = [
  "permission_denied",
  "audio_unavailable",
  "backend_unavailable",
  "ai_provider_unavailable",
  "rate_limited",
  "insufficient_credits",
];

export const OverlayListeningIndicator = memo(function OverlayListeningIndicator() {
  const isMuted = useAudioStore((s) => s.is_muted);
  const streamError = useAudioStore((s) => s.streams?.error ?? null);
  const providerStatus = useAudioStore((s) => s.transcription_provider_status);
  const audioPipeline = useAudioStore((s) => s.pipeline_status);
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const currentLevel = useAudioStore((s) => s.levels?.current_level ?? 0);
  const sessionStatus = useSessionStore((s) => s.status);
  const pipeline = useOverlayStore((s) => s.session_pipeline_state);

  let state: ListeningState = "idle";
  let label = overlayStateLabel(pipeline);
  let detail: string | undefined = overlayStateRecovery(pipeline);

  if (audioPipeline === "unavailable" && !streamError?.message) {
    state = "error";
    label = "Audio unavailable";
    detail = "Check your microphone or use text mode.";
  } else if (audioPipeline === "text_only") {
    state = "idle";
    label = "Text mode";
    detail = "Voice input is unavailable.";
  } else if (audioPipeline === "ended") {
    state = "idle";
    label = "Session ended";
    detail = undefined;
  } else if (audioPipeline === "microphone_only") {
    state = "listening";
    label = "Mic only";
    detail = "Your microphone is live. Share tab audio to capture the interviewer.";
  } else if (audioPipeline === "connecting") {
    state = "busy";
    label = "Connecting transcription…";
    detail = undefined;
  } else if (audioPipeline === "reconnecting") {
    state = "busy";
    label = "Reconnecting transcription…";
    detail = undefined;
  } else if (audioPipeline === "receiving_audio" || audioPipeline === "transcribing") {
    state = "listening";
    label = audioPipeline === "transcribing" ? "Transcribing" : "Receiving audio";
    detail = undefined;
  } else if (streamError?.message) {
    state = "error";
    label = "Error";
    detail = streamError.message;
  } else if (ERROR_PIPELINE.includes(pipeline)) {
    state = "error";
    label = overlayStateLabel(pipeline);
    detail = overlayStateRecovery(pipeline);
  } else if (isMuted) {
    state = "muted";
    label = "Muted";
    detail = undefined;
  } else if (sessionStatus === "paused" || pipeline === "paused") {
    state = "paused";
    label = "Paused";
    detail = overlayStateRecovery("paused");
  } else if (
    pipeline === "generating_guidance" ||
    pipeline === "question_detected" ||
    pipeline === "tab_audio_detected" ||
    pipeline === "question_generated" ||
    pipeline === "question_spoken" ||
    pipeline === "candidate_answering" ||
    pipeline === "answer_finalizing" ||
    pipeline === "next_question_pending" ||
    pipeline === "transcribing" ||
    pipeline === "speech_detected" ||
    pipeline === "reconnecting" ||
    pipeline === "connecting"
  ) {
    state = "busy";
    label = overlayStateLabel(pipeline);
    detail = overlayStateRecovery(pipeline);
  } else if (pipeline === "guidance_ready") {
    state = "listening";
    label = overlayStateLabel(pipeline);
    detail = "Ready for the next question";
  } else if (
    sessionStatus === "active" &&
    (providerStatus === "connected" || isCapturing || pipeline === "listening")
  ) {
    state = "listening";
    label = "Listening";
    detail = "Hints typically appear shortly after a clear question";
  } else if (sessionStatus === "active" || sessionStatus === "warming_up") {
    state = "idle";
    label = pipeline === "idle" ? "Connecting…" : overlayStateLabel(pipeline);
  }

  const announced = detail ? `${label}. ${detail}` : label;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[10px] font-bold shrink-0 max-w-[220px]",
        state === "listening" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        state === "busy" && "border-sky-500/30 bg-sky-500/10 text-sky-300",
        state === "paused" && "border-amber-500/30 bg-amber-500/10 text-amber-300",
        state === "muted" && "border-red-500/30 bg-red-500/10 text-red-300",
        state === "error" && "border-red-500/40 bg-red-500/15 text-red-300",
        state === "idle" && "border-white/10 bg-white/[0.04] text-white/45",
      )}
      role={state === "error" ? "alert" : "status"}
      aria-live={state === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      title={detail ?? label}
      data-coach="listening-indicator"
    >
      <span className="sr-only">{announced}</span>
      {state === "muted" ? (
        <MicOff className="w-2.5 h-2.5" aria-hidden />
      ) : state === "paused" ? (
        <Pause className="w-2.5 h-2.5" aria-hidden />
      ) : state === "error" ? (
        <AlertCircle className="w-2.5 h-2.5" aria-hidden />
      ) : (
      <span
        className="flex items-end gap-0.5 h-3"
        aria-hidden
        title={`Audio level ${Math.round(Math.min(1, Math.max(0, currentLevel)) * 100)}%`}
      >
          {[0.35, 0.65, 1, 0.5].map((base, i) => {
            const active = state === "listening" || state === "busy";
            const h = active
              ? Math.max(4, Math.min(12, currentLevel * 12 * base + (i % 2) * 2))
              : 4 + i;
            return (
              <span
                key={i}
                className={cn(
                  "w-0.5 rounded-sm transition-all duration-150",
                  active ? "bg-emerald-400 animate-pulse" : "bg-white/20",
                )}
                style={{
                  height: `${h}px`,
                  animationDelay: active ? `${i * 80}ms` : undefined,
                }}
              />
            );
          })}
        </span>
      )}
      <span aria-hidden="true" className="truncate">
        {label}
      </span>
    </div>
  );
});
