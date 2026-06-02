import { toast } from "sonner";

const TAB_AUDIO_GUIDE_KEY = "clarify:tab_audio_guide_ack_v1";

const TAB_AUDIO_INSTRUCTIONS =
  "When the share dialog opens: pick your interview tab, enable \"Share tab audio\", then click Share. Only audio is captured — no video.";

/** Call from pre-session wizard when system audio is enabled. */
export function acknowledgeTabAudioGuide(): void {
  try {
    sessionStorage.setItem(TAB_AUDIO_GUIDE_KEY, "1");
  } catch {
    // ignore private mode
  }
}

/** Returns true when capture may proceed (no blocking window.confirm). */
export function confirmTabAudioCapture(): boolean {
  try {
    if (sessionStorage.getItem(TAB_AUDIO_GUIDE_KEY)) return true;
  } catch {
    // fall through to toast
  }

  toast.info("Share tab audio", {
    description: TAB_AUDIO_INSTRUCTIONS,
    duration: 10_000,
  });
  acknowledgeTabAudioGuide();
  return true;
}
