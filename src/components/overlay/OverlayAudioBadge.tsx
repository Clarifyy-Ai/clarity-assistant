import { useAudioStore } from "@/store/audioStore";

export function OverlayAudioBadge() {
  const isCapturing  = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const hasSystem    = useAudioStore((s) => !!s.streams?.system_stream);

  if (!isCapturing) return null;

  if (hasSystem) {
    return (
      <span
        className="font-mono text-[9px] text-emerald-400/70 bg-emerald-500/10 px-1.5 py-0.5 rounded"
        title="Dual audio capture active (mic + system)"
      >
        DUAL
      </span>
    );
  }

  return (
    <span
      className="font-mono text-[9px] text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded"
      title="Mic-only capture — interviewer audio not captured"
    >
      MIC
    </span>
  );
}
