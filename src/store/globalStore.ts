// src/store/globalStore.ts
//
// Cross-cutting app-level state:
// - app initialization lifecycle
// - feature flags
// - active modal
// - command palette
// - banners
// - connection status
// - global error state
// - performance metrics
//
// Production-hardened version:
// - no @ts-nocheck
// - no unsafe any
// - centralized global error handling
// - listener leak protection
// - sanitized banner/query text
// - safer debug mode handling

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { sanitizeText } from "@/lib/security";
import { normalizePlanId } from "@/lib/billing/planIds";

import type { FeatureFlagId, PlanId } from "@/types";
import { FEATURE_PLAN_GATE } from "@/lib/constants/features";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AppLifecycleStatus =
  | "cold"
  | "booting"
  | "ready"
  | "error";

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
  | string;

export interface ModalState {
  id: ModalId | null;
  props?: Record<string, unknown>;
}

export type ConnectionStatus = "online" | "offline" | "degraded";

export type BannerType = "info" | "warning" | "error" | "success";

export interface AppBanner {
  id: string;
  type: BannerType;
  message: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  dismissible: boolean;
  expiresAt?: number;
}

export interface PerformanceMetrics {
  bootTimeMs: number;
  lastRenderMs: number;
  memoryUsageMB?: number;
  longTaskCount: number;
}

export type GlobalErrorSeverity = "info" | "warning" | "error" | "critical";

export interface GlobalAppError {
  id: string;
  message: string;
  code?: string;
  severity: GlobalErrorSeverity;
  source?: string;
  createdAt: number;
  details?: unknown;
}

export interface GlobalState {
  // Lifecycle
  lifecycleStatus: AppLifecycleStatus;
  bootError: string | null;
  bootTimeMs: number;
  isHydrated: boolean;

  // Feature flags
  featureFlags: Record<FeatureFlagId, boolean>;
  /** enabled=false hides a plan-gated flag. enabled=true never grants access. */
  featureKillSwitches: Partial<Record<FeatureFlagId, boolean>>;
  currentPlan: PlanId;

  // Modal system
  modal: ModalState;

  // Command palette
  isCommandPaletteOpen: boolean;
  commandPaletteQuery: string;

  // Banners
  banners: AppBanner[];

  // Connection
  connectionStatus: ConnectionStatus;
  isOnline: boolean;
  lastOnlineAt: number | null;

  // Global errors
  currentError: GlobalAppError | null;
  errorHistory: GlobalAppError[];
  lastErrorDismissedAt: number | null;

  // Debug / Performance
  isDebugMode: boolean;
  performance: PerformanceMetrics;

  // Global loading
  isForcedLoading: boolean;
  forcedLoadingMsg: string;
}

export interface GlobalActions {
  // Lifecycle
  boot: () => Promise<void>;
  setReady: () => void;
  setBootError: (error: string) => void;
  cleanup: () => void;

  // Feature flags
  resolveFeatureFlags: (planId: PlanId) => void;
  isFeatureEnabled: (flag: FeatureFlagId) => boolean;
  /** Kill-switch map from feature_flags. Only `false` hides; `true` is ignored. */
  setFeatureKillSwitches: (flags: Record<string, boolean>) => void;

  // Modal
  openModal: (id: ModalId, props?: Record<string, unknown>) => void;
  closeModal: () => void;
  toggleModal: (id: ModalId) => void;

  // Command palette
  openCommandPalette: (query?: string) => void;
  closeCommandPalette: () => void;
  setCommandQuery: (query: string) => void;

  // Banners
  addBanner: (banner: Omit<AppBanner, "id">) => void;
  dismissBanner: (id: string) => void;
  clearBanners: () => void;
  pruneExpiredBanners: () => void;

  // Connection
  setConnectionStatus: (status: ConnectionStatus) => void;
  setOnline: (online: boolean) => void;

  // Global errors
  setGlobalError: (
    error:
      | string
      | Omit<GlobalAppError, "id" | "createdAt">
  ) => void;
  clearGlobalError: () => void;
  dismissGlobalError: () => void;
  clearErrorHistory: () => void;

  // Loading
  showLoading: (message?: string) => void;
  hideLoading: () => void;

  // Debug / performance
  toggleDebugMode: () => void;
  recordPerfMetric: (key: keyof PerformanceMetrics, value: number) => void;
}

export type GlobalStore = GlobalState & GlobalActions;

// ─────────────────────────────────────────────────────────────────────────────
// Feature Flag Resolution
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_ORDER: PlanId[] = [
  "free",
  "starter",
  "pro",
  "elite",
  "enterprise",
];

function resolveFlags(planId: PlanId): Record<FeatureFlagId, boolean> {
  const normalized = normalizePlanId(planId) as PlanId;
  const userPlanIndex = PLAN_ORDER.indexOf(normalized);

  return Object.fromEntries(
    Object.entries(FEATURE_PLAN_GATE).map(([flag, minimumPlan]) => {
      const requiredPlanIndex = PLAN_ORDER.indexOf(minimumPlan as PlanId);

      return [
        flag,
        requiredPlanIndex <= userPlanIndex,
      ];
    })
  ) as Record<FeatureFlagId, boolean>;
}

/** Honor enabled=false as a hide. enabled=true never grants beyond plan. */
function applyKillSwitches(
  flags: Record<FeatureFlagId, boolean>,
  killSwitches: Partial<Record<FeatureFlagId, boolean>>,
): Record<FeatureFlagId, boolean> {
  const next = { ...flags };
  for (const [key, enabled] of Object.entries(killSwitches)) {
    if (enabled === false && key in next) {
      next[key as FeatureFlagId] = false;
    }
  }
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe Runtime Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ERROR_HISTORY = 10;
const ERROR_DEDUPE_WINDOW_MS = 2_000;

let cleanupGlobalListeners: (() => void) | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function getNow(): number {
  return Date.now();
}

function getPerformanceNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function safeMessage(message: string, maxLength = 1_000): string {
  return sanitizeText(message).slice(0, maxLength);
}

function sanitizeBannerInput(
  banner: Omit<AppBanner, "id">
): Omit<AppBanner, "id"> {
  return {
    ...banner,
    message: safeMessage(banner.message),
    action: banner.action
      ? {
          ...banner.action,
          label: safeMessage(banner.action.label, 100),
          href: banner.action.href,
          onClick: banner.action.onClick,
        }
      : undefined,
  };
}

function normalizeGlobalError(
  input: string | Omit<GlobalAppError, "id" | "createdAt">
): GlobalAppError {
  if (typeof input === "string") {
    return {
      id: createId("error"),
      message: safeMessage(input),
      severity: "error",
      createdAt: getNow(),
    };
  }

  return {
    id: createId("error"),
    message: safeMessage(input.message),
    code: input.code,
    severity: input.severity,
    source: input.source,
    details: input.details,
    createdAt: getNow(),
  };
}

function isDuplicateError(
  currentError: GlobalAppError | null,
  nextError: GlobalAppError
): boolean {
  if (!currentError) {
    return false;
  }

  return (
    currentError.message === nextError.message &&
    currentError.code === nextError.code &&
    nextError.createdAt - currentError.createdAt < ERROR_DEDUPE_WINDOW_MS
  );
}

function isDebugModeEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_PANEL === "true";
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_STATE: GlobalState = {
  lifecycleStatus: "cold",
  bootError: null,
  bootTimeMs: 0,
  isHydrated: false,

  featureFlags: resolveFlags("free"),
  featureKillSwitches: {},
  currentPlan: "free",

  modal: {
    id: null,
  },

  isCommandPaletteOpen: false,
  commandPaletteQuery: "",

  banners: [],

  connectionStatus: "online",
  isOnline: true,
  lastOnlineAt: null,

  currentError: null,
  errorHistory: [],
  lastErrorDismissedAt: null,

  isDebugMode: isDebugModeEnabled(),

  performance: {
    bootTimeMs: 0,
    lastRenderMs: 0,
    longTaskCount: 0,
  },

  isForcedLoading: false,
  forcedLoadingMsg: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useGlobalStore = create<GlobalStore>()(
  devtools(
    immer((set, get) => ({
      ...INITIAL_STATE,

      // ─────────────────────────────────────────────────────────────────────
      // Lifecycle
      // ─────────────────────────────────────────────────────────────────────

      boot: async () => {
        const start = getPerformanceNow();

        set((state) => {
          state.lifecycleStatus = "booting";
          state.bootError = null;
        });

        try {
          if (isBrowser()) {
            if (cleanupGlobalListeners) {
              cleanupGlobalListeners();
              cleanupGlobalListeners = null;
            }

            const handleOnline = () => get().setOnline(true);
            const handleOffline = () => get().setOnline(false);

            window.addEventListener("online", handleOnline);
            window.addEventListener("offline", handleOffline);

            cleanupGlobalListeners = () => {
              window.removeEventListener("online", handleOnline);
              window.removeEventListener("offline", handleOffline);
            };

            get().setOnline(window.navigator.onLine);
          }

          get().pruneExpiredBanners();

          const bootTimeMs = Math.round(getPerformanceNow() - start);

          set((state) => {
            state.lifecycleStatus = "ready";
            state.isHydrated = true;
            state.bootTimeMs = bootTimeMs;
            state.performance.bootTimeMs = bootTimeMs;
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Application failed to boot.";

          set((state) => {
            state.lifecycleStatus = "error";
            state.bootError = safeMessage(message);
            state.currentError = normalizeGlobalError({
              message,
              severity: "critical",
              source: "globalStore.boot",
            });
          });
        }
      },

      setReady: () => {
        set((state) => {
          state.lifecycleStatus = "ready";
          state.isHydrated = true;
          state.bootError = null;
        });
      },

      setBootError: (error) => {
        const message = safeMessage(error);

        set((state) => {
          state.lifecycleStatus = "error";
          state.bootError = message;
          state.currentError = normalizeGlobalError({
            message,
            severity: "critical",
            source: "globalStore.setBootError",
          });
        });
      },

      cleanup: () => {
        if (cleanupGlobalListeners) {
          cleanupGlobalListeners();
          cleanupGlobalListeners = null;
        }
      },

      // ─────────────────────────────────────────────────────────────────────
      // Feature Flags
      // ─────────────────────────────────────────────────────────────────────

      resolveFeatureFlags: (planId) => {
        const normalized = normalizePlanId(planId) as PlanId;
        set((state) => {
          state.currentPlan = normalized;
          state.featureFlags = applyKillSwitches(
            resolveFlags(normalized),
            state.featureKillSwitches,
          );
        });

        void import("@/lib/supabase/database")
          .then(({ featureFlagsDB }) => featureFlagsDB.listKeyEnabled())
          .then((map) => {
            get().setFeatureKillSwitches(map);
          })
          .catch(() => {
            // Kill-switch fetch failed: keep plan gates. Never treat as a grant.
          });
      },

      setFeatureKillSwitches: (flags) => {
        const hides: Partial<Record<FeatureFlagId, boolean>> = {};
        for (const [key, enabled] of Object.entries(flags)) {
          if (enabled === false) {
            hides[key as FeatureFlagId] = false;
          }
        }
        set((state) => {
          state.featureKillSwitches = hides;
          state.featureFlags = applyKillSwitches(
            resolveFlags(state.currentPlan),
            hides,
          );
        });
      },

      isFeatureEnabled: (flag) => {
        return get().featureFlags[flag] ?? false;
      },

      // ─────────────────────────────────────────────────────────────────────
      // Modal
      // ─────────────────────────────────────────────────────────────────────

      openModal: (id, props) => {
        set((state) => {
          state.modal = {
            id,
            props,
          };
        });
      },

      closeModal: () => {
        set((state) => {
          state.modal = {
            id: null,
          };
        });
      },

      toggleModal: (id) => {
        set((state) => {
          state.modal =
            state.modal.id === id
              ? { id: null }
              : { id };
        });
      },

      // ─────────────────────────────────────────────────────────────────────
      // Command Palette
      // ─────────────────────────────────────────────────────────────────────

      openCommandPalette: (query = "") => {
        set((state) => {
          state.isCommandPaletteOpen = true;
          state.commandPaletteQuery = safeMessage(query, 200);
        });
      },

      closeCommandPalette: () => {
        set((state) => {
          state.isCommandPaletteOpen = false;
          state.commandPaletteQuery = "";
        });
      },

      setCommandQuery: (query) => {
        set((state) => {
          state.commandPaletteQuery = safeMessage(query, 200);
        });
      },

      // ─────────────────────────────────────────────────────────────────────
      // Banners
      // ─────────────────────────────────────────────────────────────────────

      addBanner: (banner) => {
        const sanitizedBanner = sanitizeBannerInput(banner);
        const id = createId("banner");

        set((state) => {
          const isDuplicate = state.banners.some(
            (existingBanner) =>
              existingBanner.message === sanitizedBanner.message &&
              existingBanner.type === sanitizedBanner.type
          );

          if (!isDuplicate) {
            state.banners.push({
              ...sanitizedBanner,
              id,
            });
          }
        });
      },

      dismissBanner: (id) => {
        set((state) => {
          state.banners = state.banners.filter((banner) => banner.id !== id);
        });
      },

      clearBanners: () => {
        set((state) => {
          state.banners = [];
        });
      },

      pruneExpiredBanners: () => {
        const now = getNow();

        set((state) => {
          state.banners = state.banners.filter(
            (banner) => !banner.expiresAt || banner.expiresAt > now
          );
        });
      },

      // ─────────────────────────────────────────────────────────────────────
      // Connection
      // ─────────────────────────────────────────────────────────────────────

      setConnectionStatus: (status) => {
        set((state) => {
          state.connectionStatus = status;
          state.isOnline = status !== "offline";

          if (status === "online") {
            state.lastOnlineAt = getNow();
          }
        });
      },

      setOnline: (online) => {
        set((state) => {
          state.isOnline = online;
          state.connectionStatus = online ? "online" : "offline";

          if (online) {
            state.lastOnlineAt = getNow();
          }
        });
      },

      // ─────────────────────────────────────────────────────────────────────
      // Global Errors
      // ─────────────────────────────────────────────────────────────────────

      setGlobalError: (error) => {
        const nextError = normalizeGlobalError(error);

        set((state) => {
          if (isDuplicateError(state.currentError, nextError)) {
            return;
          }

          state.currentError = nextError;

          state.errorHistory = [
            nextError,
            ...state.errorHistory,
          ].slice(0, MAX_ERROR_HISTORY);
        });
      },

      clearGlobalError: () => {
        set((state) => {
          state.currentError = null;
        });
      },

      dismissGlobalError: () => {
        set((state) => {
          state.currentError = null;
          state.lastErrorDismissedAt = getNow();
        });
      },

      clearErrorHistory: () => {
        set((state) => {
          state.errorHistory = [];
        });
      },

      // ─────────────────────────────────────────────────────────────────────
      // Loading Overlay
      // ─────────────────────────────────────────────────────────────────────

      showLoading: (message = "Loading…") => {
        set((state) => {
          state.isForcedLoading = true;
          state.forcedLoadingMsg = safeMessage(message, 200);
        });
      },

      hideLoading: () => {
        set((state) => {
          state.isForcedLoading = false;
          state.forcedLoadingMsg = "";
        });
      },

      // ─────────────────────────────────────────────────────────────────────
      // Debug / Performance
      // ─────────────────────────────────────────────────────────────────────

      toggleDebugMode: () => {
        set((state) => {
          state.isDebugMode = !state.isDebugMode;
        });
      },

      recordPerfMetric: (key, value) => {
        if (!Number.isFinite(value)) {
          return;
        }

        set((state) => {
          state.performance[key] = value;
        });
      },
    })),
    {
      name: "GlobalStore",
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const selectIsAppReady = (state: GlobalStore): boolean =>
  state.lifecycleStatus === "ready";

export const selectIsBooting = (state: GlobalStore): boolean =>
  state.lifecycleStatus === "cold" || state.lifecycleStatus === "booting";

export const selectLifecycleStatus = (
  state: GlobalStore
): AppLifecycleStatus => state.lifecycleStatus;

export const selectBootError = (state: GlobalStore): string | null =>
  state.bootError;

export const selectIsOnline = (state: GlobalStore): boolean =>
  state.isOnline;

export const selectConnectionStatus = (
  state: GlobalStore
): ConnectionStatus => state.connectionStatus;

export const selectActiveModal = (state: GlobalStore): ModalState =>
  state.modal;

export const selectIsModalOpen =
  (id: ModalId) =>
  (state: GlobalStore): boolean =>
    state.modal.id === id;

export const selectFeatureFlag =
  (flag: FeatureFlagId) =>
  (state: GlobalStore): boolean =>
    state.featureFlags[flag] ?? false;

export const selectCurrentPlan = (state: GlobalStore): PlanId =>
  state.currentPlan;

export const selectBanners = (state: GlobalStore): AppBanner[] => {
  const now = getNow();

  return state.banners.filter(
    (banner) => !banner.expiresAt || banner.expiresAt > now
  );
};

export const selectCurrentError = (
  state: GlobalStore
): GlobalAppError | null => state.currentError;

export const selectErrorHistory = (
  state: GlobalStore
): GlobalAppError[] => state.errorHistory;

export const selectIsDebug = (state: GlobalStore): boolean =>
  state.isDebugMode;

export const selectIsForcedLoading = (state: GlobalStore): boolean =>
  state.isForcedLoading;

export const selectForcedLoadingMessage = (state: GlobalStore): string =>
  state.forcedLoadingMsg;

export const selectPerformanceMetrics = (
  state: GlobalStore
): PerformanceMetrics => state.performance;

export const selectIsCommandPaletteOpen = (
  state: GlobalStore
): boolean => state.isCommandPaletteOpen;

export const selectCommandPaletteQuery = (
  state: GlobalStore
): string => state.commandPaletteQuery;
