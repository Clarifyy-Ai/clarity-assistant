// ─────────────────────────────────────────────────────────────────────────────
// globalStore.ts — Cross-cutting app-level state: initialization lifecycle,
// feature flags, active modal, command palette, connection status,
// and performance metrics. Orchestrates store boot sequence.
// ─────────────────────────────────────────────────────────────────────────────

import { create }        from "zustand";
import { devtools }      from "zustand/middleware";
import { immer }         from "zustand/middleware/immer";

import type { FeatureFlagId, PlanId } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppLifecycleStatus =
  | "cold"          // app not yet mounted
  | "booting"       // stores initialising
  | "ready"         // all stores hydrated, ready to render
  | "error";        // fatal boot error

export type ModalId =
  | "upgrade"
  | "credit-topup"
  | "hotkeys"
  | "audio-settings"
  | "account-delete"
  | "session-end-confirm"
  | "feedback"
  | "share-session"
  | "byok-setup"
  | "onboarding"
  | "command-palette"
  | string;         // allow feature-specific modals

export interface ModalState {
  id:      ModalId | null;
  props?:  Record<string, unknown>;
}

export type ConnectionStatus = "online" | "offline" | "degraded";

export type BannerType = "info" | "warning" | "error" | "success";

export interface AppBanner {
  id:          string;
  type:        BannerType;
  message:     string;
  action?:     { label: string; href?: string; onClick?: () => void };
  dismissible: boolean;
  expiresAt?:  number;  // timestamp
}

export interface PerformanceMetrics {
  bootTimeMs:        number;
  lastRenderMs:      number;
  memoryUsageMB?:    number;
  longTaskCount:     number;
}

export interface GlobalState {
  // Lifecycle
  lifecycleStatus:    AppLifecycleStatus;
  bootError:          string | null;
  bootTimeMs:         number;
  isHydrated:         boolean;

  // Feature flags (resolved against current plan)
  featureFlags:       Record<FeatureFlagId, boolean>;
  currentPlan:        PlanId;

  // Modal system
  modal:              ModalState;

  // Command palette
  isCommandPaletteOpen: boolean;
  commandPaletteQuery:  string;

  // Banners
  banners:            AppBanner[];

  // Connection
  connectionStatus:   ConnectionStatus;
  isOnline:           boolean;
  lastOnlineAt:       number | null;

  // Debug / Perf
  isDebugMode:        boolean;
  performance:        PerformanceMetrics;

  // Global loading / toasts gate
  isForcedLoading:    boolean;
  forcedLoadingMsg:   string;
}

export interface GlobalActions {
  // Lifecycle
  boot:              () => Promise<void>;
  setReady:          () => void;
  setBootError:      (error: string) => void;

  // Feature flags
  resolveFeatureFlags: (planId: PlanId) => void;
  isFeatureEnabled:  (flag: FeatureFlagId) => boolean;

  // Modal
  openModal:         (id: ModalId, props?: Record<string, unknown>) => void;
  closeModal:        () => void;
  toggleModal:       (id: ModalId) => void;

  // Command palette
  openCommandPalette:  (query?: string) => void;
  closeCommandPalette: () => void;
  setCommandQuery:     (q: string) => void;

  // Banners
  addBanner:         (banner: Omit<AppBanner, "id">) => void;
  dismissBanner:     (id: string) => void;
  clearBanners:      () => void;

  // Connection
  setConnectionStatus: (status: ConnectionStatus) => void;
  setOnline:         (online: boolean) => void;

  // Loading overlay
  showLoading:       (message?: string) => void;
  hideLoading:       () => void;

  // Debug
  toggleDebugMode:   () => void;
  recordPerfMetric:  (key: keyof PerformanceMetrics, value: number) => void;
}

export type GlobalStore = GlobalState & GlobalActions;

// ─── Feature Flag Resolution ─────────────────────────────────────────────────

const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "elite", "enterprise"];

const FEATURE_PLAN_GATES: Record<FeatureFlagId, PlanId> = {
  live_assist:         "free",
  mock_sessions:       "free",
  answer_bank:         "free",
  star_builder:        "free",
  rephraser:           "free",
  ai_coach:            "free",
  company_research:    "starter",
  coding_hints:        "starter",
  system_design:       "starter",
  session_debrief:     "starter",
  resume_analysis:     "starter",
  overlay:             "starter",
  audio_analysis:      "starter",
  filler_detection:    "starter",
  wpm_tracking:        "starter",
  analytics:           "starter",
  stealth_mode:        "pro",
  screenshot_capture:  "pro",
  diarization:         "pro",
  byok:                "pro",
  calendar_sync:       "pro",
  priority_support:    "elite",
  coach_sessions:      "elite",
  experimental_ui:     "pro",
  debug_panel:         "enterprise",
  beta_models:         "pro",
};

function resolveFlags(planId: PlanId): Record<FeatureFlagId, boolean> {
  const userIndex = PLAN_ORDER.indexOf(planId);
  return Object.fromEntries(
    Object.entries(FEATURE_PLAN_GATES).map(([flag, minPlan]) => [
      flag,
      PLAN_ORDER.indexOf(minPlan as PlanId) <= userIndex,
    ])
  ) as Record<FeatureFlagId, boolean>;
}

// ─── Initial State ────────────────────────────────────────────────────────────

const INITIAL_STATE: GlobalState = {
  lifecycleStatus:      "cold",
  bootError:            null,
  bootTimeMs:           0,
  isHydrated:           false,
  featureFlags:         resolveFlags("free"),
  currentPlan:          "free",
  modal:                { id: null },
  isCommandPaletteOpen: false,
  commandPaletteQuery:  "",
  banners:              [],
  connectionStatus:     "online",
  isOnline:             true,
  lastOnlineAt:         null,
  isDebugMode:          import.meta.env.DEV,
  performance:          { bootTimeMs: 0, lastRenderMs: 0, longTaskCount: 0 },
  isForcedLoading:      false,
  forcedLoadingMsg:     "",
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGlobalStore = create<GlobalStore>()(
  devtools(
    immer((set, get) => ({
      ...INITIAL_STATE,

      // ── Lifecycle ─────────────────────────────────────────────────────────

      boot: async () => {
        const start = performance.now();
        set((s) => { s.lifecycleStatus = "booting"; });

        try {
          // Wire up online/offline listeners
          const handleOnline = () => get().setOnline(true);
          const handleOffline = () => get().setOnline(false);

          window.addEventListener("online",  handleOnline);
          window.addEventListener("offline", handleOffline);

          // Clean up expired banners on boot
          const now = Date.now();
          set((s) => {
            s.banners = s.banners.filter(
              (b) => !b.expiresAt || b.expiresAt > now
            );
          });

          const bootMs = Math.round(performance.now() - start);
          set((s) => {
            s.lifecycleStatus             = "ready";
            s.isHydrated                  = true;
            s.bootTimeMs                  = bootMs;
            s.performance.bootTimeMs      = bootMs;
          });
        } catch (err) {
          set((s) => {
            s.lifecycleStatus = "error";
            s.bootError       = (err as Error).message;
          });
        }
      },

      setReady: () => {
        set((s) => { s.lifecycleStatus = "ready"; s.isHydrated = true; });
      },

      setBootError: (error) => {
        set((s) => { s.lifecycleStatus = "error"; s.bootError = error; });
      },

      // ── Feature Flags ─────────────────────────────────────────────────────

      resolveFeatureFlags: (planId) => {
        set((s) => {
          s.featureFlags = resolveFlags(planId);
          s.currentPlan  = planId;
        });
      },

      isFeatureEnabled: (flag) => {
        return get().featureFlags[flag] ?? false;
      },

      // ── Modal ─────────────────────────────────────────────────────────────

      openModal: (id, props) => {
        set((s) => { s.modal = { id, props }; });
      },

      closeModal: () => {
        set((s) => { s.modal = { id: null }; });
      },

      toggleModal: (id) => {
        set((s) => {
          s.modal = s.modal.id === id ? { id: null } : { id };
        });
      },

      // ── Command Palette ───────────────────────────────────────────────────

      openCommandPalette: (query = "") => {
        set((s) => {
          s.isCommandPaletteOpen = true;
          s.commandPaletteQuery  = query;
        });
      },

      closeCommandPalette: () => {
        set((s) => {
          s.isCommandPaletteOpen = false;
          s.commandPaletteQuery  = "";
        });
      },

      setCommandQuery: (q) => {
        set((s) => { s.commandPaletteQuery = q; });
      },

      // ── Banners ───────────────────────────────────────────────────────────

      addBanner: (banner) => {
        const id = `banner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((s) => {
          // Prevent duplicate banners with same message
          const isDuplicate = s.banners.some((b) => b.message === banner.message);
          if (!isDuplicate) s.banners.push({ ...banner, id });
        });
      },

      dismissBanner: (id) => {
        set((s) => { s.banners = s.banners.filter((b) => b.id !== id); });
      },

      clearBanners: () => {
        set((s) => { s.banners = []; });
      },

      // ── Connection ────────────────────────────────────────────────────────

      setConnectionStatus: (status) => {
        set((s) => {
          s.connectionStatus = status;
          s.isOnline         = status !== "offline";
        });
      },

      setOnline: (online) => {
        set((s) => {
          s.isOnline         = online;
          s.connectionStatus = online ? "online" : "offline";
          if (online) s.lastOnlineAt = Date.now();
        });
      },

      // ── Loading Overlay ───────────────────────────────────────────────────

      showLoading: (message = "Loading…") => {
        set((s) => {
          s.isForcedLoading   = true;
          s.forcedLoadingMsg  = message;
        });
      },

      hideLoading: () => {
        set((s) => {
          s.isForcedLoading  = false;
          s.forcedLoadingMsg = "";
        });
      },

      // ── Debug / Perf ──────────────────────────────────────────────────────

      toggleDebugMode: () => {
        set((s) => { s.isDebugMode = !s.isDebugMode; });
      },

      recordPerfMetric: (key, value) => {
        set((s) => { (s.performance as Record<string, unknown>)[key] = value; });
      },
    })),
    { name: "GlobalStore" }
  )
);

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectIsAppReady = (s: GlobalStore) =>
  s.lifecycleStatus === "ready";

export const selectIsBooting = (s: GlobalStore) =>
  s.lifecycleStatus === "cold" || s.lifecycleStatus === "booting";

export const selectIsOnline = (s: GlobalStore) => s.isOnline;

export const selectActiveModal = (s: GlobalStore) => s.modal;

export const selectIsModalOpen = (id: ModalId) => (s: GlobalStore) =>
  s.modal.id === id;

export const selectFeatureFlag = (flag: FeatureFlagId) => (s: GlobalStore) =>
  s.featureFlags[flag] ?? false;

export const selectBanners = (s: GlobalStore) =>
  s.banners.filter((b) => !b.expiresAt || b.expiresAt > Date.now());

export const selectIsDebug = (s: GlobalStore) => s.isDebugMode;

export const selectIsForcedLoading = (s: GlobalStore) => s.isForcedLoading;
