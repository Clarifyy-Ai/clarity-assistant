// ─── Auth & User ──────────────────────────────────────────────────────────────
export { useAuth } from "./useAuth";

// ─── UI / Device ──────────────────────────────────────────────────────────────
export { useIsMobile } from "./use-mobile";
export { useSwipeAction } from "./useSwipeAction";
export { useToast } from "./use-toast";

// ─── Storage ─────────────────────────────────────────────────────────────────
export {
  useLocalStorage,
  useLocalStorageString,
  useLocalStorageBoolean,
  useLocalStorageNumber,
} from "./useLocalStorage";

// ─── Audio & Speech ───────────────────────────────────────────────────────────
export { useAudioCapture } from "./useAudioCapture";
export { useAudioSession } from "./useAudioSession";
export { useSpeechRecognition } from "./useSpeechRecognition";
export { useSpeakerDiarization } from "./useSpeakerDiarization";
export { useFillerWordDetection } from "./useFillerWordDetection";
export { useSilenceBoundary } from "./useSilenceBoundary";
export { useSystemAudio } from "./useSystemAudio";
export { useWPMTracker } from "./useWPMTracker";

// ─── Session & Live ───────────────────────────────────────────────────────────
export { useLiveCopilot } from "./useLiveCopilot";
export { useSessionContext } from "./useSessionContext";
export { useSessionOrchestrator } from "./useSessionOrchestrator";

// ─── Overlay ──────────────────────────────────────────────────────────────────
export { useOverlayVisibility } from "./useOverlayVisibility";
export { useHotkeys } from "./useHotkeys";
export { useNetworkMonitor } from "./useNetworkMonitor";
export { useOfflineFallback } from "./useOfflineFallback";
export { useIsOffline } from "./useIsOffline";
export { useDesktopDownload } from "./useDesktopDownload";
export { useStealthMouse } from "./useStealthMouse";

// ─── AI & Analysis ────────────────────────────────────────────────────────────
export { useConfidenceScore } from "./useConfidenceScore";
export { useSentimentAnalysis } from "./useSentimentAnalysis";
export { useModelSwitcher } from "./useModelSwitcher";

// ─── Interview & Prep ─────────────────────────────────────────────────────────
export { useInterviewScheduler } from "./useInterviewScheduler";
export { useScorecard } from "./useScorecard";
export { useResumeContext } from "./useResumeContext";
export { useCalendarSync } from "./useCalendarSync";

// ─── Documents ────────────────────────────────────────────────────────────────
export { useDocumentManager } from "./useDocumentManager";
export { useDocuments } from "./useDocuments";

// ─── Gamification & Engagement ────────────────────────────────────────────────
export { useGamification } from "./useGamification";
export { useXPSystem } from "./useXPSystem";
export { useStreakTracker } from "./useStreakTracker";

// ─── Billing ─────────────────────────────────────────────────────────────────
export { useCredits } from "./useCredits";

// ─── Notifications ───────────────────────────────────────────────────────────
export { useNotifications } from "./useNotifications";

// ─── Analytics ───────────────────────────────────────────────────────────────
export { useAnalytics } from "./useAnalytics";
