// src/store/overlayStore.ts
import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { HintStyle, PreferredAIModel } from "@/types/user.types";
import type { ResumeTalkingPoints, ResumeContext } from "@/lib/ai/resumeFallback";
import { clearLastFullScreenshot } from "@/lib/audio/screenshotCapture";
import {
  transitionOverlayState,
  type OverlaySessionState,
} from "@/lib/overlay/overlaySessionStates";
import { clampPreferredModel } from "@/lib/ai/modelOptions";
import { useAuthStore } from "@/store/authStore";

// ─────────────────────────────────────────────────────────────────
// Overlay Position
// ─────────────────────────────────────────────────────────────────

export interface OverlayPosition {
  x: number;
  y: number;
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

// ─────────────────────────────────────────────────────────────────
// Overlay Layout Mode
// ─────────────────────────────────────────────────────────────────

/**
 * Overlay layout mode enum.
 *  - floating  — free-floating draggable panel (default)
 *  - docked    — locked to screen edge; no drag
 *  - sidebar   — fixed to right/left edge, full viewport height
 *  - compact   — minimal pill
 */
export type OverlayLayoutMode = "floating" | "docked" | "sidebar" | "compact";

export interface ActivityLogEntry {
  event: string;
  timestamp: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export interface CaptureAnswerRecord {
  id: string;
  question: string;
  answer: string;
  thumbnail_base64?: string;
  captured_at: number;
}

const MAX_CAPTURE_ANSWER_HISTORY = 3;

interface OverlayStore {
  is_visible: boolean;
  is_stealth_mode: boolean;
  is_proctor_safe: boolean;

  current_question: string;
  current_hint: string;
  hint_state: HintState;
  streaming_buffer: string;
  error_message: string | null;

  hint_style: HintStyle;
  active_model: PreferredAIModel;
  answer_mode: "hint" | "full_answer";

  position: OverlayPosition;
  overlay_width: number;
  overlay_height: number;

  auto_generate: boolean;
  /** Seconds of silence after interviewer stops before auto-generating (1–10). */
  auto_answer_silence_seconds: number;
  simple_language: boolean;
  save_transcript: boolean;
  session_call_type: "interview" | "regular_call";
  session_language: string;
  active_tab: "answer" | "chat" | "transcript" | "audit" | "resume";

  network_color: "green" | "yellow" | "red";

  is_panic_visible: boolean;
  panic_content: { step_1: string; step_2: string; step_3: string } | null;

  hint_history: Array<{ question: string; hint: string; timestamp: number }>;
  hint_history_index: number;
  questions_detected: number;
  viewed_question: string | null;

  is_screenshot_loading: boolean;
  screenshot_hint: string | null;
  capture_answer_history: CaptureAnswerRecord[];
  capture_answer_index: number;
  has_recrop_source: boolean;
  capture_coding_handler: (() => void) | null;
  adjust_region_handler: (() => void) | null;

  session_start_time: number | null;
  activity_log: ActivityLogEntry[];

  stealth_opacity: number;
  font_size: number;

  is_peek_active: boolean;
  is_minimal_mode: boolean;
  is_hotkey_help_visible: boolean;
  is_pip_active: boolean;
  pip_opt_in: boolean;
  overlay_layout_mode: OverlayLayoutMode;
  /** Canonical capture → guidance pipeline state (see overlaySessionStates). */
  session_pipeline_state: OverlaySessionState;
  always_on_top: boolean;
  presentation_safe_mode: boolean;

  chat_history: ChatMessage[];
  is_chat_generating: boolean;

  resume_context: ResumeContext | null;
  resume_talking_points: ResumeTalkingPoints | null;

  pinned_hints: Array<{ id: string; question: string; hint: string; timestamp: number }>;

  setOverlayLayoutMode: (mode: OverlayLayoutMode) => void;
  showOverlay: () => void;
  hideOverlay: () => void;
  toggleOverlay: () => void;
  setStealthMode: (enabled: boolean) => void;
  setProctorSafe: (enabled: boolean) => void;

  minimizeOverlay: () => void;
  restoreOverlay: () => void;
  toggleMinimize: () => void;

  setCurrentQuestion: (question: string) => void;
  setHintState: (state: HintState) => void;
  setSessionPipelineState: (state: OverlaySessionState) => void;
  setAlwaysOnTop: (enabled: boolean) => void;
  setPresentationSafeMode: (enabled: boolean) => void;
  appendStreamChunk: (chunk: string) => void;
  commitStreamedHint: () => void;
  clearHint: () => void;
  setError: (message: string | null) => void;
  setOfflineFallback: (hint: string) => void;

  setHintStyle: (style: HintStyle) => void;
  cycleHintStyle: () => void;
  setActiveModel: (model: PreferredAIModel) => void;
  setAnswerMode: (mode: "hint" | "full_answer") => void;

  navigateHintHistory: (direction: "prev" | "next") => void;

  setPosition: (position: OverlayPosition) => void;
  resetPosition: () => void;
  setOverlaySize: (width: number, height: number) => void;

  setAutoGenerate: (enabled: boolean) => void;
  setAutoAnswerSilenceSeconds: (seconds: number) => void;
  setSimpleLanguage: (enabled: boolean) => void;
  setSaveTranscript: (enabled: boolean) => void;
  setSessionCallType: (type: "interview" | "regular_call") => void;
  setSessionLanguage: (language: string) => void;
  setActiveTab: (tab: "answer" | "chat" | "transcript" | "audit" | "resume") => void;

  addChatMessage: (msg: ChatMessage) => void;
  clearChatHistory: () => void;
  setChatGenerating: (generating: boolean) => void;

  setResumeContext: (ctx: ResumeContext | null) => void;
  setResumeTalkingPoints: (points: ResumeTalkingPoints | null) => void;

  togglePinHint: (hint: string, question: string) => void;
  clearPinnedHints: () => void;

  setNetworkColor: (color: "green" | "yellow" | "red") => void;

  showPanic: (content: { step_1: string; step_2: string; step_3: string }) => void;
  hidePanic: () => void;

  resetSessionState: () => void;

  setScreenshotLoading: (loading: boolean) => void;
  setScreenshotHint: (hint: string | null) => void;
  pushCaptureAnswer: (entry: Omit<CaptureAnswerRecord, "id" | "captured_at"> & {
    id?: string;
    captured_at?: number;
  }) => void;
  selectCaptureAnswer: (index: number) => void;
  setHasRecropSource: (has: boolean) => void;
  setCaptureCodingHandler: (handler: (() => void) | null) => void;
  setAdjustRegionHandler: (handler: (() => void) | null) => void;

  startActivityTimer: () => void;
  logActivity: (event: string) => void;

  setStealthOpacity: (opacity: number) => void;
  setFontSize: (size: number) => void;

  setPeekActive: (active: boolean) => void;

  setMinimalMode: (enabled: boolean) => void;

  setHotkeyHelpVisible: (visible: boolean) => void;
  toggleHotkeyHelp: () => void;

  setPipActive: (active: boolean) => void;
  setPipOptIn: (enabled: boolean) => void;
}

const DEFAULT_POSITION: OverlayPosition = (() => {
  if (typeof window === "undefined") return { x: 0, y: 16 };
  const width = 560;
  const x = Math.max(16, Math.round((window.innerWidth - width) / 2));
  return { x, y: 16 };
})();

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 520;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 900;

const HINT_STYLE_CYCLE: HintStyle[] = [
  "full_answer",
  "short_hints",
  "keywords_only",
];

export const useOverlayStore = create<OverlayStore>()(
  persist(
    subscribeWithSelector((set) => ({
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
      answer_mode: "hint",

      position: DEFAULT_POSITION,
      overlay_width: DEFAULT_WIDTH,
      overlay_height: DEFAULT_HEIGHT,

      auto_generate: true,
      auto_answer_silence_seconds: 3,
      simple_language: false,
      save_transcript: true,
      session_call_type: "interview",
      session_language: "English",
      active_tab: "answer",

      network_color: "green",

      is_panic_visible: false,
      panic_content: null,

      hint_history: [],
      hint_history_index: -1,
      questions_detected: 0,
      viewed_question: null,

      is_screenshot_loading: false,
      screenshot_hint: null,
      capture_answer_history: [],
      capture_answer_index: -1,
      has_recrop_source: false,
      capture_coding_handler: null,
      adjust_region_handler: null,

      session_start_time: null,
      activity_log: [],

      stealth_opacity: 90,
      font_size: 13,

      is_peek_active: false,
      is_minimal_mode: false,
      overlay_layout_mode: "floating" as OverlayLayoutMode,
      session_pipeline_state: "idle" as OverlaySessionState,
      always_on_top: false,
      presentation_safe_mode: false,

      is_hotkey_help_visible: false,
      is_pip_active: false,
      pip_opt_in: false,

      chat_history: [],
      is_chat_generating: false,

      resume_context: null,
      resume_talking_points: null,

      pinned_hints: [],

      showOverlay: () =>
        set((s) => ({
          is_visible: true,
          is_peek_active: false,
          session_start_time: s.session_start_time ?? Date.now(),
          activity_log: [
            ...s.activity_log,
            { event: "overlay_shown", timestamp: Date.now() },
          ],
        })),

      hideOverlay: () =>
        set((s) => ({
          is_visible: false,
          is_panic_visible: false,
          is_peek_active: false,
          activity_log: [
            ...s.activity_log,
            { event: "overlay_hidden", timestamp: Date.now() },
          ],
        })),

      toggleOverlay: () =>
        set((s) => {
          const willShow = !s.is_visible;
          return {
            is_visible: willShow,
            activity_log: [
              ...s.activity_log,
              {
                event: willShow ? "overlay_shown" : "overlay_hidden",
                timestamp: Date.now(),
              },
            ],
            ...(willShow
              ? {
                  session_start_time: s.session_start_time ?? Date.now(),
                  is_peek_active: false,
                }
              : {
                  is_panic_visible: false,
                  is_peek_active: false,
                }),
          };
        }),

      setStealthMode: (enabled) => set({ is_stealth_mode: enabled }),
      setProctorSafe: (enabled) => set({ is_proctor_safe: enabled }),

      minimizeOverlay: () =>
        set((s) => ({
          is_visible: false,
          is_peek_active: true,
          // Do NOT force is_minimal_mode — minimized just hides the panel;
          // peek pill renders via is_peek_active branch independently.
          is_panic_visible: false,
          activity_log: [
            ...s.activity_log,
            { event: "overlay_minimized", timestamp: Date.now() },
          ],
        })),

      restoreOverlay: () =>
        set((s) => ({
          is_visible: true,
          is_peek_active: false,
          is_minimal_mode: false,
          session_start_time: s.session_start_time ?? Date.now(),
          activity_log: [
            ...s.activity_log,
            { event: "overlay_restored", timestamp: Date.now() },
          ],
        })),

      toggleMinimize: () =>
        set((s) => {
          if (s.is_visible) {
            return {
              is_visible: false,
              is_peek_active: true,
              is_panic_visible: false,
              activity_log: [
                ...s.activity_log,
                { event: "overlay_minimized", timestamp: Date.now() },
              ],
            };
          }

          if (s.is_peek_active) {
            return {
              is_visible: true,
              is_peek_active: false,
              is_minimal_mode: false,
              session_start_time: s.session_start_time ?? Date.now(),
              activity_log: [
                ...s.activity_log,
                { event: "overlay_restored", timestamp: Date.now() },
              ],
            };
          }

          return {
            is_visible: true,
            is_peek_active: false,
            is_minimal_mode: false,
            session_start_time: s.session_start_time ?? Date.now(),
            activity_log: [
              ...s.activity_log,
              { event: "overlay_shown", timestamp: Date.now() },
            ],
          };
        }),

      setCurrentQuestion: (current_question) =>
        set((s) => ({
          current_question,
          hint_state: "listening",
          current_hint: "",
          streaming_buffer: "",
          questions_detected:
            current_question !== s.current_question
              ? s.questions_detected + 1
              : s.questions_detected,
          activity_log:
            current_question !== s.current_question
              ? [
                  ...s.activity_log,
                  { event: "question_detected", timestamp: Date.now() },
                ]
              : s.activity_log,
        })),

      setHintState: (hint_state) =>
        set((s) => {
          let session_pipeline_state = s.session_pipeline_state;
          if (hint_state === "generating") {
            session_pipeline_state = transitionOverlayState(
              s.session_pipeline_state,
              "generating_guidance",
            );
          } else if (hint_state === "streaming") {
            session_pipeline_state = transitionOverlayState(
              s.session_pipeline_state,
              "generating_guidance",
            );
          } else if (hint_state === "ready") {
            session_pipeline_state = transitionOverlayState(
              s.session_pipeline_state,
              "guidance_ready",
            );
          } else if (hint_state === "error") {
            session_pipeline_state = transitionOverlayState(
              s.session_pipeline_state,
              "ai_provider_unavailable",
            );
          } else if (hint_state === "offline_fallback") {
            session_pipeline_state = transitionOverlayState(
              s.session_pipeline_state,
              "backend_unavailable",
            );
          }
          return { hint_state, session_pipeline_state };
        }),

      setSessionPipelineState: (next) =>
        set((s) => ({
          session_pipeline_state: transitionOverlayState(
            s.session_pipeline_state,
            next,
          ),
        })),

      setAlwaysOnTop: (always_on_top) => set({ always_on_top: Boolean(always_on_top) }),
      setPresentationSafeMode: (presentation_safe_mode) =>
        set({ presentation_safe_mode: Boolean(presentation_safe_mode) }),

      appendStreamChunk: (chunk) =>
        set((state) => ({
          streaming_buffer: state.streaming_buffer + chunk,
          hint_state: "streaming",
          session_pipeline_state: transitionOverlayState(
            state.session_pipeline_state,
            "generating_guidance",
          ),
        })),

      commitStreamedHint: () =>
        set((state) => {
          const text = state.streaming_buffer.trim();
          if (!text) {
            return {
              streaming_buffer: "",
              hint_state: "idle" as HintState,
              session_pipeline_state: transitionOverlayState(
                state.session_pipeline_state,
                "listening",
              ),
            };
          }

          const newHistory = [
            ...state.hint_history,
            {
              question: state.current_question,
              hint: text,
              timestamp: Date.now(),
            },
          ];

          return {
            current_hint: text,
            streaming_buffer: "",
            hint_state: "ready" as HintState,
            session_pipeline_state: transitionOverlayState(
              state.session_pipeline_state,
              "guidance_ready",
            ),
            hint_history: newHistory,
            hint_history_index: newHistory.length - 1,
            activity_log: [
              ...state.activity_log,
              { event: "hint_generated", timestamp: Date.now() },
            ],
          };
        }),

      clearHint: () =>
        set((s) => ({
          current_hint: "",
          streaming_buffer: "",
          hint_state: "idle" as HintState,
          error_message: null,
          screenshot_hint: null,
          session_pipeline_state: transitionOverlayState(
            s.session_pipeline_state,
            "listening",
          ),
        })),

      setError: (error_message) =>
        set((s) => {
          const msg = (error_message ?? "").toLowerCase();
          let next: OverlaySessionState = "ai_provider_unavailable";
          if (msg.includes("credit")) next = "insufficient_credits";
          else if (msg.includes("rate") || msg.includes("429")) next = "rate_limited";
          else if (msg.includes("permission") || msg.includes("mic"))
            next = "permission_denied";
          else if (msg.includes("network") || msg.includes("offline"))
            next = "backend_unavailable";
          return {
            error_message,
            hint_state: "error" as HintState,
            session_pipeline_state: transitionOverlayState(
              s.session_pipeline_state,
              next,
            ),
          };
        }),

      setOfflineFallback: (hint) =>
        set((s) => ({
          current_hint: hint,
          streaming_buffer: "",
          hint_state: "offline_fallback" as HintState,
          session_pipeline_state: transitionOverlayState(
            s.session_pipeline_state,
            "guidance_ready",
          ),
        })),

      setHintStyle: (hint_style) => set({ hint_style }),

      cycleHintStyle: () =>
        set((state) => {
          const idx = HINT_STYLE_CYCLE.indexOf(state.hint_style);
          const next = HINT_STYLE_CYCLE[(idx + 1) % HINT_STYLE_CYCLE.length];
          return { hint_style: next };
        }),

      setActiveModel: (active_model) => {
        const planId = useAuthStore.getState().planId ?? "free";
        set({ active_model: clampPreferredModel(active_model, planId) });
      },
      setAnswerMode: (answer_mode) => set({ answer_mode }),

      navigateHintHistory: (direction) =>
        set((state) => {
          if (state.hint_history.length === 0) return {};

          const baseIndex =
            state.hint_history_index < 0
              ? state.hint_history.length
              : state.hint_history_index;

          const newIndex =
            direction === "prev"
              ? Math.max(0, baseIndex - 1)
              : Math.min(state.hint_history.length - 1, baseIndex + 1);

          if (newIndex === state.hint_history_index) return {};

          const entry = state.hint_history[newIndex];
          return {
            hint_history_index: newIndex,
            current_hint: entry.hint,
            viewed_question: entry.question,
            hint_state: "ready" as HintState,
            streaming_buffer: "",
          };
        }),

      setPosition: (position) => set({ position }),
      resetPosition: () => set({ position: DEFAULT_POSITION }),
      setOverlaySize: (width, height) =>
        set({
          overlay_width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)),
          overlay_height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height)),
        }),

      setAutoGenerate: (auto_generate) => set({ auto_generate }),
      setAutoAnswerSilenceSeconds: (auto_answer_silence_seconds) =>
        set({
          auto_answer_silence_seconds: Math.max(
            1,
            Math.min(10, Math.round(auto_answer_silence_seconds)),
          ),
        }),
      setSimpleLanguage: (simple_language) => set({ simple_language }),
      setSaveTranscript: (save_transcript) => set({ save_transcript }),
      setSessionCallType: (session_call_type) => set({ session_call_type }),
      setSessionLanguage: (session_language) => set({ session_language }),
      setActiveTab: (active_tab) => set({ active_tab }),

      addChatMessage: (msg) =>
        set((s) => ({
          chat_history: [...s.chat_history, msg],
          is_chat_generating: false,
        })),
      clearChatHistory: () =>
        set({ chat_history: [], is_chat_generating: false }),
      setChatGenerating: (is_chat_generating) => set({ is_chat_generating }),

      setResumeContext: (resume_context) => set({ resume_context }),
      setResumeTalkingPoints: (resume_talking_points) =>
        set({ resume_talking_points }),

      togglePinHint: (hint, question) =>
        set((s) => {
          const alreadyPinned = s.pinned_hints.some((p) => p.hint === hint);
          if (alreadyPinned) {
            return {
              pinned_hints: s.pinned_hints.filter((p) => p.hint !== hint),
            };
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

      setNetworkColor: (network_color) => set({ network_color }),

      showPanic: (panic_content) =>
        set({
          is_panic_visible: true,
          panic_content,
          is_visible: true,
          is_peek_active: false,
        }),
      hidePanic: () => set({ is_panic_visible: false }),

      resetSessionState: () => {
        clearLastFullScreenshot();
        set({
          current_question: "",
          current_hint: "",
          hint_state: "idle",
          session_pipeline_state: "idle",
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
          capture_answer_history: [],
          capture_answer_index: -1,
          has_recrop_source: false,

          network_color: "green",
          active_tab: "answer",

          session_start_time: null,
          activity_log: [],

          is_peek_active: false,
          is_minimal_mode: false,
          is_hotkey_help_visible: false,

          chat_history: [],
          is_chat_generating: false,

          resume_context: null,
          resume_talking_points: null,

          pinned_hints: [],

          session_call_type: "interview",
        });
      },

      setScreenshotLoading: (is_screenshot_loading) =>
        set({ is_screenshot_loading }),
      setScreenshotHint: (screenshot_hint) =>
        set({ screenshot_hint, is_screenshot_loading: false }),

      pushCaptureAnswer: (entry) =>
        set((s) => {
          const record: CaptureAnswerRecord = {
            id: entry.id ?? `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            question: entry.question,
            answer: entry.answer,
            thumbnail_base64: entry.thumbnail_base64,
            captured_at: entry.captured_at ?? Date.now(),
          };
          const next = [...s.capture_answer_history, record].slice(
            -MAX_CAPTURE_ANSWER_HISTORY,
          );
          return {
            capture_answer_history: next,
            capture_answer_index: next.length - 1,
          };
        }),

      selectCaptureAnswer: (index) =>
        set((s) => {
          const entry = s.capture_answer_history[index];
          if (!entry) return {};
          return {
            capture_answer_index: index,
            current_hint: entry.answer,
            current_question: entry.question,
            hint_state: "ready" as HintState,
            streaming_buffer: "",
            active_tab: "answer",
          };
        }),

      setHasRecropSource: (has_recrop_source) => set({ has_recrop_source }),

      setCaptureCodingHandler: (capture_coding_handler) =>
        set({ capture_coding_handler }),

      setAdjustRegionHandler: (adjust_region_handler) =>
        set({ adjust_region_handler }),

      startActivityTimer: () =>
        set({
          session_start_time: Date.now(),
          activity_log: [{ event: "session_started", timestamp: Date.now() }],
        }),
      logActivity: (event) =>
        set((s) => ({
          activity_log: [...s.activity_log, { event, timestamp: Date.now() }],
        })),

      setStealthOpacity: (opacity) =>
        set({
          stealth_opacity: Math.max(20, Math.min(100, opacity)),
        }),

      setFontSize: (font_size) =>
        set({
          font_size: Math.max(11, Math.min(20, font_size)),
        }),

      setOverlayLayoutMode: (overlay_layout_mode) =>
        set((s) => ({
          overlay_layout_mode,
          // Sync minimal mode flag for compact layout.
          is_minimal_mode: overlay_layout_mode === "compact" ? true : s.is_minimal_mode,
          // Sidebar / docked disable proctor-safe corner lock.
          is_proctor_safe: overlay_layout_mode === "docked" || overlay_layout_mode === "sidebar"
            ? false
            : s.is_proctor_safe,
        })),

      // Peek shows a temporary minimal pill without permanently changing layout mode.
      setPeekActive: (is_peek_active) =>
        set((s) => ({
          is_peek_active,
          is_visible: is_peek_active ? false : s.is_visible,
          is_panic_visible: is_peek_active ? false : s.is_panic_visible,
          // Do NOT force is_minimal_mode — peek has its own render branch.
        })),

      setMinimalMode: (is_minimal_mode) =>
        set((s) => ({
          is_minimal_mode,
          active_tab:
            is_minimal_mode &&
            s.active_tab !== "answer" &&
            s.active_tab !== "resume"
              ? "answer"
              : s.active_tab,
        })),

      setHotkeyHelpVisible: (is_hotkey_help_visible) =>
        set({ is_hotkey_help_visible }),
      toggleHotkeyHelp: () =>
        set((s) => ({ is_hotkey_help_visible: !s.is_hotkey_help_visible })),

      setPipActive: (is_pip_active) => set({ is_pip_active }),
      setPipOptIn: (pip_opt_in) => set({ pip_opt_in }),
    })),
    {
      name: "clarify-overlay",
      partialize: (state) => ({
        position: state.position,
        overlay_width: state.overlay_width,
        overlay_height: state.overlay_height,
        hint_style: state.hint_style,
        is_stealth_mode: state.is_stealth_mode,
        is_proctor_safe: state.is_proctor_safe,
        auto_generate: state.auto_generate,
        auto_answer_silence_seconds: state.auto_answer_silence_seconds,
        simple_language: state.simple_language,
        save_transcript: state.save_transcript,
        session_language: state.session_language,
        stealth_opacity: state.stealth_opacity,
        font_size: state.font_size,
        is_minimal_mode: state.is_minimal_mode,
        overlay_layout_mode: state.overlay_layout_mode,
        pip_opt_in: state.pip_opt_in,
        always_on_top: state.always_on_top,
        presentation_safe_mode: state.presentation_safe_mode,
      }),
    }
  )
);
