// ─────────────────────────────────────────────────────────────────────────────
// overlay.types.ts — All types for the stealth overlay window system.
// Covers positioning, theming, panel layout, stealth mode, session
// display state, and all overlay-specific UI configuration.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Position & Geometry ──────────────────────────────────────────────────────

export interface OverlayPosition {
  x:      number;     // px from left
  y:      number;     // px from top
  width:  number;     // px
  height: number;     // px
}

export type SnapPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "bottom-center"
  | "center"
  | "custom";

export interface OverlayAnchor {
  snapPosition: SnapPosition;
  offsetX:      number;    // px adjustment from snap point
  offsetY:      number;
}

// ─── Theme & Appearance ──────────────────────────────────────────────────────

export type OverlayTheme = "dark" | "light" | "glass" | "minimal";

export type OverlaySize = "compact" | "default" | "expanded" | "full";

export interface OverlayAppearance {
  theme:          OverlayTheme;
  opacity:        number;          // 0.1–1.0
  blur:           boolean;         // backdrop-filter blur
  borderRadius:   number;          // px
  fontSize:       "sm" | "md" | "lg";
  accentColor?:   string;          // hex override
  animationsEnabled: boolean;
}

// ─── Visibility State ─────────────────────────────────────────────────────────

export type OverlayVisibility =
  | "visible"          // fully visible
  | "minimized"        // title bar only
  | "hidden"           // completely hidden (panic/stealth)
  | "peek"             // showing on hover only
  | "picture-in-picture"; // browser PiP mode

export interface OverlayVisibilityState {
  current:          OverlayVisibility;
  previousVisible:  boolean;   // was visible before last toggle?
  panicHidden:      boolean;   // hidden via panic key
  autoHideEnabled:  boolean;
  autoHideDelayMs:  number;
}

// ─── Panel Layout ─────────────────────────────────────────────────────────────

export type OverlayPanel =
  | "transcript"      // live transcript feed
  | "answer"          // AI-generated answer
  | "hints"           // quick hints panel
  | "coach"           // AI coach chat
  | "notes"           // personal notes
  | "questions"       // question history
  | "metrics"         // live audio/speech metrics
  | "prep"            // pre-session prep materials
  | "none";           // overlay minimized / panel-less

export type PanelLayout =
  | "single"          // one panel at a time
  | "split-vertical"  // two panels side-by-side
  | "split-horizontal"// two panels top/bottom
  | "tabs";           // tabbed interface

export interface OverlayPanelState {
  activePanel:       OverlayPanel;
  secondaryPanel?:   OverlayPanel;    // for split layouts
  layout:            PanelLayout;
  availablePanels:   OverlayPanel[];  // depends on plan
  pinnedPanel?:      OverlayPanel;    // always visible
}

// ─── Stealth Mode ────────────────────────────────────────────────────────────

export interface StealthConfig {
  enabled:              boolean;
  hideFromScreenShare:  boolean;    // attempt to exclude from capture
  hideFromTaskbar:      boolean;
  hideFromAltTab:       boolean;
  antiScreenshotMode:  boolean;    // force opacity to 0 on screenshot key
  clickThrough:         boolean;   // pointer-events: none on outer shell
  panicKey:             string;    // keyboard combo to instant-hide
  panicHideAnimation:   "fade" | "instant" | "shrink";
}

// ─── Session Display State ───────────────────────────────────────────────────

export interface OverlaySessionState {
  isSessionActive:     boolean;
  sessionId?:          string;
  sessionDurationMs:   number;
  isPaused:            boolean;
  isMicActive:         boolean;
  isSystemAudioActive: boolean;
  currentQuestion?:    OverlayQuestion;
  questionCount:       number;
  questionIndex:       number;
}

export interface OverlayQuestion {
  id:            string;
  text:          string;
  type:          string;           // behavioral, technical, etc.
  detectedAt:    string;
  confidence:    number;           // 0–1 Deepgram confidence
}

// ─── Answer Display ───────────────────────────────────────────────────────────

export type AnswerStatus =
  | "idle"
  | "generating"
  | "streaming"
  | "complete"
  | "error"
  | "cached";

export interface OverlayAnswerState {
  status:          AnswerStatus;
  text:            string;
  streamBuffer:    string;         // partial text during streaming
  model:           string;
  generatedAt?:    string;
  creditsUsed:     number;
  isCopied:        boolean;
  isSaved:         boolean;
  error?:          string;
  hints:           string[];
}

// ─── Transcript Display ───────────────────────────────────────────────────────

export interface OverlayTranscriptLine {
  id:         string;
  speaker:    "interviewer" | "user" | "unknown";
  text:       string;
  isFinal:    boolean;
  confidence: number;
  timestamp:  number;     // ms since session start
  wordCount:  number;
}

export interface OverlayTranscriptState {
  lines:              OverlayTranscriptLine[];
  isListening:        boolean;
  lastActivityMs:     number;
  autoScroll:         boolean;
  highlightFillers:   boolean;
  maxDisplayLines:    number;
}

// ─── Speech Metrics Display ──────────────────────────────────────────────────

export interface OverlayMetricsState {
  wpm:              number;
  rms:              number;         // 0–1 mic level
  fillerCount:      number;
  fillerRate:       number;         // per minute
  speakingRatio:    number;         // 0–1 (time user spoke vs total)
  pauseCount:       number;
  lastPauseDurationMs: number;
  wpmHistory:       number[];       // rolling window, last N samples
}

// ─── Overlay Settings ─────────────────────────────────────────────────────────

export interface OverlaySettings {
  // Appearance
  appearance:          OverlayAppearance;
  size:                OverlaySize;

  // Position
  anchor:              OverlayAnchor;
  rememberPosition:    boolean;
  savedPosition?:      OverlayPosition;

  // Behaviour
  alwaysOnTop:         boolean;
  followActiveWindow:  boolean;
  autoShowOnSession:   boolean;
  autoHideOnIdle:      boolean;
  autoHideDelayMs:     number;

  // Panels
  defaultPanel:        OverlayPanel;
  showMetricsBar:      boolean;
  showTimerBar:        boolean;
  showMicIndicator:    boolean;
  showModelBadge:      boolean;
  showCreditBalance:   boolean;

  // Stealth
  stealth:             StealthConfig;

  // Hotkeys (key combo strings)
  hotkeys: {
    toggleVisibility: string;
    panicHide:        string;
    generateAnswer:   string;
    copyAnswer:       string;
    nextQuestion:     string;
    prevQuestion:     string;
    toggleMic:        string;
    cyclePanel:       string;
    increaseOpacity:  string;
    decreaseOpacity:  string;
    snapLeft:         string;
    snapRight:        string;
  };
}

// ─── Full Overlay State (Zustand store shape) ────────────────────────────────

export interface OverlayState {
  // Core
  isInitialized:    boolean;
  isSupported:      boolean;        // browser supports required APIs?
  error?:           string;

  // Visibility
  visibility:       OverlayVisibilityState;

  // Session
  session:          OverlaySessionState;

  // Content panels
  answer:           OverlayAnswerState;
  transcript:       OverlayTranscriptState;
  metrics:          OverlayMetricsState;
  activePanel:      OverlayPanelState;

  // Settings (persisted)
  settings:         OverlaySettings;

  // Runtime
  position:         OverlayPosition;
  isDragging:       boolean;
  isResizing:       boolean;
  lastInteractionAt: number;
}

// ─── Overlay Actions ──────────────────────────────────────────────────────────

export interface OverlayActions {
  // Visibility
  show:              () => void;
  hide:              () => void;
  toggle:            () => void;
  minimize:          () => void;
  panicHide:         () => void;
  restore:           () => void;

  // Position
  setPosition:       (pos: Partial<OverlayPosition>) => void;
  snapTo:            (position: SnapPosition) => void;

  // Appearance
  setTheme:          (theme: OverlayTheme) => void;
  setOpacity:        (value: number) => void;
  setSize:           (size: OverlaySize) => void;
  increaseOpacity:   () => void;
  decreaseOpacity:   () => void;

  // Panels
  setPanel:          (panel: OverlayPanel) => void;
  cyclePanel:        () => void;

  // Session
  startSession:      (sessionId: string) => void;
  endSession:        () => void;
  pauseSession:      () => void;
  resumeSession:     () => void;
  setQuestion:       (question: OverlayQuestion) => void;
  nextQuestion:      () => void;
  prevQuestion:      () => void;

  // Answer
  setAnswerGenerating: () => void;
  appendAnswerChunk: (chunk: string) => void;
  setAnswerComplete: (text: string, model: string, credits: number) => void;
  setAnswerError:    (error: string) => void;
  clearAnswer:       () => void;
  copyAnswer:        () => Promise<void>;
  saveAnswer:        () => Promise<void>;

  // Transcript
  appendTranscript:  (line: Omit<OverlayTranscriptLine, "id">) => void;
  clearTranscript:   () => void;

  // Metrics
  updateMetrics:     (metrics: Partial<OverlayMetricsState>) => void;

  // Settings
  updateSettings:    (settings: Partial<OverlaySettings>) => void;
  resetSettings:     () => void;
}

// ─── Overlay Store (combined) ─────────────────────────────────────────────────

export type OverlayStore = OverlayState & OverlayActions;

// ─── Overlay Events (window messaging for Electron/extension) ────────────────

export type OverlayEventType =
  | "overlay:show"
  | "overlay:hide"
  | "overlay:toggle"
  | "overlay:minimize"
  | "overlay:panic"
  | "overlay:answer_ready"
  | "overlay:question_detected"
  | "overlay:transcript_update"
  | "overlay:metrics_update"
  | "overlay:settings_changed"
  | "overlay:session_start"
  | "overlay:session_end";

export interface OverlayEvent<T = unknown> {
  type:      OverlayEventType;
  payload?:  T;
  timestamp: number;
  source:    "app" | "hotkey" | "user" | "system";
}

// ─── Overlay Component Props ──────────────────────────────────────────────────

export interface OverlayWrapperProps {
  children:       React.ReactNode;
  initialVisible?: boolean;
}

export interface OverlayPanelProps {
  isActive:  boolean;
  className?: string;
}

export interface OverlayAnswerPanelProps extends OverlayPanelProps {
  answer:    OverlayAnswerState;
  onCopy:    () => void;
  onSave:    () => void;
  onRegen:   () => void;
}

export interface OverlayTranscriptPanelProps extends OverlayPanelProps {
  transcript: OverlayTranscriptState;
  onClear:    () => void;
}

export interface OverlayMetricsPanelProps extends OverlayPanelProps {
  metrics:    OverlayMetricsState;
  session:    OverlaySessionState;
}
