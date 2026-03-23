import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { HintStyle, PreferredAIModel } from "@/types/user.types";
import type { ResumeTalkingPoints, ResumeContext } from "@/lib/ai/resumeFallback";

// ─────────────────────────────────────────────────────────────────
// Overlay Position
// ─────────────────────────────────────────────────────────────────

export interface OverlayPosition {
  x: number;   // px from left
  y: number;   // px from top
}

// ─────────────────────────────────────────────────────────────────
// Hint State
// ─────────────────────────────────────────────────────────────────

export type HintState =
  | "idle"
  | "listening"
  | "generating"
  | "streaming"
  | "ready"
  | "error"
  | "offline_fallback";

// ─────────────────────────────────────────────────────────────────
// Overlay Store
// ─────────────────────────────────────────────────────────────────

export interface ActivityLogEntry {
  event: string;
  timestamp: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface OverlayStore {
  // Visibility
  is_visible: boolean;
  is_stealth_mode: boolean;
  is_proctor_safe: boolean;

  // Content
  current_question: string;
  current_hint: string;
  hint_state: HintState;
  streaming_buffer: string;
  error_message: string | null;

  // Settings (per-session overrides)
  hint_style: HintStyle;
  active_model: PreferredAIModel;

  // Position & size (persisted)
  position: OverlayPosition;
  overlay_width: number;
  overlay_height: number;

  // Session controls
  auto_generate: boolean;
  simple_language: boolean;
  save_transcript: boolean;
  session_call_type: "interview" | "regular_call";
  session_language: string;
  active_tab: "answer" | "chat" | "transcript" | "audit" | "resume";

  // Network indicator shown in overlay
  network_color: "green" | "yellow" | "red";

  // Panic
  is_panic_visible: boolean;
  panic_content: { step_1: string; step_2: string; step_3: string } | null;

  // Hint history for session persistence
  hint_history: Array<{ question: string; hint: string; timestamp: number }>;
  hint_history_index: number;
  questions_detected: number;
  viewed_question: string | null;

  // Coding problem capture
  is_screenshot_loading: boolean;
  screenshot_hint: string | null;

  // Activity timer
  session_start_time: number | null;
  activity_log: ActivityLogEntry[];

  // Stealth opacity (persisted, 20–100)
  stealth_opacity: number;

  // Peek mode
  is_peek_active: boolean;

  // Minimal mode (persisted)
  is_minimal_mode: boolean;

  // Hotkey help overlay
  is_hotkey_help_visible: boolean;

  // Document Picture-in-Picture state (runtime only — not persisted)
  is_pip_active: boolean;

  // Chat history (not persisted)
  chat_history: ChatMessage[];
  is_chat_generating: boolean;

  // Resume context (not persisted)
  resume_context: ResumeContext | null;
  resume_talking_points: ResumeTalkingPoints | null;

  // Pinned hints (not persisted)
  pinned_hints: Array<{ id: string; question: string; hint: string; timestamp: number }>;

  // Actions — visibility
  showOverlay: () => void;
  hideOverlay: () => void;
  toggleOverlay: () => void;
  setStealthMode: (enabled: boolean) => void;
  setProctorSafe: (enabled: boolean) => void;

  // Actions — content
  setCurrentQuestion: (question: string) => void;
  setHintState: (state: HintState) => void;
  appendStreamChunk: (chunk: string) => void;
  commitStreamedHint: () => void;
  clearHint: () => void;
  setError: (message: string | null) => void;
  setOfflineFallback: (hint: string) => void;

  // Actions — settings
  setHintStyle: (style: HintStyle) => void;
  cycleHintStyle: () => void;
  setActiveModel: (model: PreferredAIModel) => void;

  // Actions — hint history navigation
  navigateHintHistory: (direction: "prev" | "next") => void;

  // Actions — position & size
  setPosition: (position: OverlayPosition) => void;
  resetPosition: () => void;
  setOverlaySize: (width: number, height: number) => void;

  // Actions — session controls
  setAutoGenerate: (enabled: boolean) => void;
  setSimpleLanguage: (enabled: boolean) => void;
  setSaveTranscript: (enabled: boolean) => void;
  setSessionCallType: (type: "interview" | "regular_call") => void;
  setSessionLanguage: (language: string) => void;
  setActiveTab: (tab: "answer" | "chat" | "transcript" | "audit" | "resume") => void;

  // Actions — chat history
  addChatMessage: (msg: ChatMessage) => void;
  clearChatHistory: () => void;
  setChatGenerating: (generating: boolean) => void;

  // Actions — resume context
  setResumeContext: (ctx: ResumeContext | null) => void;
  setResumeTalkingPoints: (points: ResumeTalkingPoints | null) => void;

  // Actions — pinned hints
  togglePinHint: (hint: string, question: string) => void;
  clearPinnedHints: () => void;

  // Actions — network
  setNetworkColor: (color: "green" | "yellow" | "red") => void;

  // Actions — panic
  showPanic: (content: { step_1: string; step_2: string; step_3: string }) => void;
  hidePanic: () => void;

  // Actions — session lifecycle
  resetSessionState: () => void;

  // Actions — coding
  setScreenshotLoading: (loading: boolean) => void;
  setScreenshotHint: (hint: string | null) => void;

  // Actions — activity timer
  startActivityTimer: () => void;
  logActivity: (event: string) => void;

  // Actions — stealth opacity
  setStealthOpacity: (opacity: number) => void;

  // Actions — peek mode
  setPeekActive: (active: boolean) => void;

  // Actions — minimal mode
  setMinimalMode: (enabled: boolean) => void;

  // Actions — hotkey help
  setHotkeyHelpVisible: (visible: boolean) => void;
  toggleHotkeyHelp: () => void;

  // Actions — PiP
  setPipActive: (active: boolean) => void;
}

const DEFAULT_POSITION: OverlayPosition = { x: 24, y: 80 };
const DEFAULT_WIDTH  = 420;
const DEFAULT_HEIGHT = 520;
const MIN_WIDTH      = 320;
const MIN_HEIGHT     = 280;
const MAX_WIDTH      = 800;
const MAX_HEIGHT     = 900;

const HINT_STYLE_CYCLE: HintStyle[] = [
  "full_answer",
  "short_hints",
  "keywords_only",
];

export const useOverlayStore = create<OverlayStore>()(
  persist(
    subscribeWithSelector((set, get) => ({
      // ── Initial State ──────────────────────────────────────
      is_visible: false,
      is_stealth_mode: false,
      is_proctor_safe: false,

      current_question: "",
      current_hint: "",
      hint_state: "idle",
      streaming_buffer: "",
      error_message: null,

      hint_style: "short_hints",
      active_model: "gemini-flash",

      position: DEFAULT_POSITION,
      overlay_width: DEFAULT_WIDTH,
      overlay_height: DEFAULT_HEIGHT,

      auto_generate: true,
      simple_language: false,
      save_transcript: true,
      session_call_type: "interview" as const,
      session_language: "English",
      active_tab: "answer" as const,

      network_color: "green",

      is_panic_visible: false,
      panic_content: null,

      hint_history: [],
      hint_history_index: -1,
      questions_detected: 0,
      viewed_question: null,

      is_screenshot_loading: false,
      screenshot_hint: null,

      session_start_time: null,
      activity_log: [],
      stealth_opacity: 90,
      is_peek_active: false,
      is_minimal_mode: false,
      is_hotkey_help_visible: false,
      is_pip_active: false,

      chat_history: [],
      is_chat_generating: false,

      resume_context: null,
      resume_talking_points: null,

      pinned_hints: [],

      // ── Visibility ─────────────────────────────────────────
      showOverlay: () => set((s) => ({
        is_visible: true,
        session_start_time: s.session_start_time ?? Date.now(),
        activity_log: [...s.activity_log, { event: "overlay_shown", timestamp: Date.now() }],
      })),
      hideOverlay: () => set((s) => ({
        is_visible: false,
        is_panic_visible: false,
        is_peek_active: false,
        activity_log: [...s.activity_log, { event: "overlay_hidden", timestamp: Date.now() }],
      })),
      toggleOverlay: () => set((s) => {
        const willShow = !s.is_visible;
        return {
          is_visible: willShow,
          activity_log: [...s.activity_log, { event: willShow ? "overlay_shown" : "overlay_hidden", timestamp: Date.now() }],
          ...(willShow ? { session_start_time: s.session_start_time ?? Date.now() } : { is_panic_visible: false, is_peek_active: false }),
        };
      }),
      setStealthMode: (enabled) => set({ is_stealth_mode: enabled }),
      setProctorSafe: (enabled) => set({ is_proctor_safe: enabled }),

      // ── Content ────────────────────────────────────────────
      setCurrentQuestion: (current_question) =>
        set((s) => ({
          current_question,
          hint_state: "listening" as const,
          current_hint: "",
          streaming_buffer: "",
          questions_detected: current_question !== s.current_question ? s.questions_detected + 1 : s.questions_detected,
          activity_log: current_question !== s.current_question
            ? [...s.activity_log, { event: "question_detected", timestamp: Date.now() }]
            : s.activity_log,
        })),

      setHintState: (hint_state) => set({ hint_state }),

      appendStreamChunk: (chunk) =>
        set((state) => ({
          streaming_buffer: state.streaming_buffer + chunk,
          hint_state: "streaming",
        })),

      commitStreamedHint: () =>
        set((state) => {
          const newHistory = [
            ...state.hint_history,
            {
              question: state.current_question,
              hint: state.streaming_buffer,
              timestamp: Date.now(),
            },
          ];
          return {
            current_hint: state.streaming_buffer,
            streaming_buffer: "",
            hint_state: "ready",
            hint_history: newHistory,
            hint_history_index: newHistory.length - 1,
            activity_log: [...state.activity_log, { event: "hint_generated", timestamp: Date.now() }],
          };
        }),

      clearHint: () =>
        set({
          current_hint: "",
          streaming_buffer: "",
          hint_state: "idle",
          error_message: null,
          screenshot_hint: null,
        }),

      setError: (error_message) =>
        set({ error_message, hint_state: "error" }),

      setOfflineFallback: (hint) =>
        set({
          current_hint: hint,
          streaming_buffer: "",
          hint_state: "offline_fallback",
          error_message: null,
        }),

      // ── Settings ───────────────────────────────────────────
      setHintStyle: (hint_style) => set({ hint_style }),

      cycleHintStyle: () =>
        set((state) => {
          const idx = HINT_STYLE_CYCLE.indexOf(state.hint_style);
          const next = HINT_STYLE_CYCLE[(idx + 1) % HINT_STYLE_CYCLE.length];
          return { hint_style: next };
        }),

      setActiveModel: (active_model) => set({ active_model }),

      // ── Hint History Navigation ─────────────────────────────
      navigateHintHistory: (direction) =>
        set((state) => {
          if (state.hint_history.length === 0) return {};
          const newIndex = direction === "prev"
            ? Math.max(0, state.hint_history_index - 1)
            : Math.min(state.hint_history.length - 1, state.hint_history_index + 1);
          if (newIndex === state.hint_history_index) return {};
          const entry = state.hint_history[newIndex];
          return {
            hint_history_index: newIndex,
            current_hint: entry.hint,
            viewed_question: entry.question,
            hint_state: "ready" as const,
            streaming_buffer: "",
          };
        }),

      // ── Position & Size ────────────────────────────────────
      setPosition: (position) => set({ position }),
      resetPosition: () => set({ position: DEFAULT_POSITION }),
      setOverlaySize: (width, height) => set({
        overlay_width:  Math.max(MIN_WIDTH,  Math.min(MAX_WIDTH,  width)),
        overlay_height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height)),
      }),

      // ── Session Controls ─────────────────────────────────
      setAutoGenerate: (auto_generate) => set({ auto_generate }),
      setSimpleLanguage: (simple_language) => set({ simple_language }),
      setSaveTranscript: (save_transcript) => set({ save_transcript }),
      setSessionCallType: (session_call_type) => set({ session_call_type }),
      setSessionLanguage: (session_language) => set({ session_language }),
      setActiveTab: (active_tab) => set({ active_tab }),

      // ── Chat History ────────────────────────────────────────
      addChatMessage: (msg) => set((s) => ({
        chat_history: [...s.chat_history, msg],
        is_chat_generating: false,
      })),
      clearChatHistory: () => set({ chat_history: [], is_chat_generating: false }),
      setChatGenerating: (is_chat_generating) => set({ is_chat_generating }),

      // ── Resume Context ──────────────────────────────────────
      setResumeContext: (resume_context) => set({ resume_context }),
      setResumeTalkingPoints: (resume_talking_points) => set({ resume_talking_points }),

      // ── Pinned Hints ────────────────────────────────────────
      togglePinHint: (hint, question) => set((s) => {
        const alreadyPinned = s.pinned_hints.some((p) => p.hint === hint);
        if (alreadyPinned) {
          return { pinned_hints: s.pinned_hints.filter((p) => p.hint !== hint) };
        }
        const newPin = {
          id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          question,
          hint,
          timestamp: Date.now(),
        };
        return { pinned_hints: [...s.pinned_hints, newPin] };
      }),
      clearPinnedHints: () => set({ pinned_hints: [] }),

      // ── Network ────────────────────────────────────────────
      setNetworkColor: (network_color) => set({ network_color }),

      // ── Panic ──────────────────────────────────────────────
      showPanic: (panic_content) =>
        set({ is_panic_visible: true, panic_content, is_visible: true }),
      hidePanic: () => set({ is_panic_visible: false }),

      // ── Session Lifecycle ──────────────────────────────────
      resetSessionState: () => set({
        current_question: "",
        current_hint: "",
        hint_state: "idle" as const,
        streaming_buffer: "",
        error_message: null,
        hint_history: [],
        hint_history_index: -1,
        questions_detected: 0,
        viewed_question: null,
        is_panic_visible: false,
        panic_content: null,
        screenshot_hint: null,
        is_screenshot_loading: false,
        network_color: "green" as const,
        active_tab: "answer" as const,
        session_start_time: null,
        activity_log: [],
        is_peek_active: false,
        is_hotkey_help_visible: false,
        chat_history: [],
        is_chat_generating: false,
        resume_context: null,
        resume_talking_points: null,
        pinned_hints: [],
        session_call_type: "interview" as const,
      }),

      // ── Coding ─────────────────────────────────────────────
      setScreenshotLoading: (is_screenshot_loading) => set({ is_screenshot_loading }),
      setScreenshotHint: (screenshot_hint) =>
        set({ screenshot_hint, is_screenshot_loading: false }),

      // ── Activity Timer ──────────────────────────────────────
      startActivityTimer: () => set({
        session_start_time: Date.now(),
        activity_log: [{ event: "session_started", timestamp: Date.now() }],
      }),
      logActivity: (event) => set((s) => ({
        activity_log: [...s.activity_log, { event, timestamp: Date.now() }],
      })),

      // ── Stealth Opacity ─────────────────────────────────────
      setStealthOpacity: (opacity) => set({
        stealth_opacity: Math.max(20, Math.min(100, opacity)),
      }),

      // ── Peek Mode ───────────────────────────────────────────
      setPeekActive: (is_peek_active) => set({ is_peek_active }),

      // ── Minimal Mode ────────────────────────────────────────
      setMinimalMode: (is_minimal_mode) => set((s) => ({
        is_minimal_mode,
        active_tab: is_minimal_mode && s.active_tab !== "answer" && s.active_tab !== "resume" ? "answer" as const : s.active_tab,
      })),

      // ── Hotkey Help ─────────────────────────────────────────
      setHotkeyHelpVisible: (is_hotkey_help_visible) => set({ is_hotkey_help_visible }),
      toggleHotkeyHelp: () => set((s) => ({ is_hotkey_help_visible: !s.is_hotkey_help_visible })),

      // ── PiP ─────────────────────────────────────────────────
      setPipActive: (is_pip_active) => set({ is_pip_active }),
    })),
    {
      name: "confideq-overlay",
      // Only persist position and hint_style — not content
      partialize: (state) => ({
        position: state.position,
        overlay_width: state.overlay_width,
        overlay_height: state.overlay_height,
        hint_style: state.hint_style,
        is_stealth_mode: state.is_stealth_mode,
        is_proctor_safe: state.is_proctor_safe,
        auto_generate: state.auto_generate,
        simple_language: state.simple_language,
        save_transcript: state.save_transcript,
        session_language: state.session_language,
        stealth_opacity: state.stealth_opacity,
        is_minimal_mode: state.is_minimal_mode,
      }),
    }
  )
);
