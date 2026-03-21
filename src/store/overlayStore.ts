import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { HintStyle, PreferredAIModel } from "@/types/user.types";

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
  active_tab: "answer" | "transcript" | "audit";

  // Network indicator shown in overlay
  network_color: "green" | "yellow" | "red";

  // Panic
  is_panic_visible: boolean;
  panic_content: { step_1: string; step_2: string; step_3: string } | null;

  // Hint history for session persistence
  hint_history: Array<{ question: string; hint: string; timestamp: number }>;

  // Coding problem capture
  is_screenshot_loading: boolean;
  screenshot_hint: string | null;

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

  // Actions — position & size
  setPosition: (position: OverlayPosition) => void;
  resetPosition: () => void;
  setOverlaySize: (width: number, height: number) => void;

  // Actions — session controls
  setAutoGenerate: (enabled: boolean) => void;
  setActiveTab: (tab: "answer" | "transcript" | "audit") => void;

  // Actions — network
  setNetworkColor: (color: "green" | "yellow" | "red") => void;

  // Actions — panic
  showPanic: (content: { step_1: string; step_2: string; step_3: string }) => void;
  hidePanic: () => void;

  // Actions — coding
  setScreenshotLoading: (loading: boolean) => void;
  setScreenshotHint: (hint: string | null) => void;
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
      is_stealth_mode: true,
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
      active_tab: "answer" as const,

      network_color: "green",

      is_panic_visible: false,
      panic_content: null,

      hint_history: [],

      is_screenshot_loading: false,
      screenshot_hint: null,

      // ── Visibility ─────────────────────────────────────────
      showOverlay: () => set({ is_visible: true }),
      hideOverlay: () => set({ is_visible: false, is_panic_visible: false }),
      toggleOverlay: () => set((s) => ({ is_visible: !s.is_visible })),
      setStealthMode: (enabled) => set({ is_stealth_mode: enabled }),
      setProctorSafe: (enabled) => set({ is_proctor_safe: enabled }),

      // ── Content ────────────────────────────────────────────
      setCurrentQuestion: (current_question) =>
        set({ current_question, hint_state: "listening", current_hint: "", streaming_buffer: "" }),

      setHintState: (hint_state) => set({ hint_state }),

      appendStreamChunk: (chunk) =>
        set((state) => ({
          streaming_buffer: state.streaming_buffer + chunk,
          hint_state: "streaming",
        })),

      commitStreamedHint: () =>
        set((state) => ({
          current_hint: state.streaming_buffer,
          streaming_buffer: "",
          hint_state: "ready",
          hint_history: [
            ...state.hint_history,
            {
              question: state.current_question,
              hint: state.streaming_buffer,
              timestamp: Date.now(),
            },
          ],
        })),

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

      // ── Position & Size ────────────────────────────────────
      setPosition: (position) => set({ position }),
      resetPosition: () => set({ position: DEFAULT_POSITION }),
      setOverlaySize: (width, height) => set({
        overlay_width:  Math.max(MIN_WIDTH,  Math.min(MAX_WIDTH,  width)),
        overlay_height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height)),
      }),

      // ── Session Controls ─────────────────────────────────
      setAutoGenerate: (auto_generate) => set({ auto_generate }),
      setActiveTab: (active_tab) => set({ active_tab }),

      // ── Network ────────────────────────────────────────────
      setNetworkColor: (network_color) => set({ network_color }),

      // ── Panic ──────────────────────────────────────────────
      showPanic: (panic_content) =>
        set({ is_panic_visible: true, panic_content, is_visible: true }),
      hidePanic: () => set({ is_panic_visible: false }),

      // ── Coding ─────────────────────────────────────────────
      setScreenshotLoading: (is_screenshot_loading) => set({ is_screenshot_loading }),
      setScreenshotHint: (screenshot_hint) =>
        set({ screenshot_hint, is_screenshot_loading: false }),
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
      }),
    }
  )
);
