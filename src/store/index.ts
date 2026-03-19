// ─────────────────────────────────────────────────────────────────────────────
// store/index.ts — Barrel export for all Zustand stores.
// Also exports the app boot sequence used in main.tsx / App.tsx.
// ─────────────────────────────────────────────────────────────────────────────

// ─── New (this PR) ────────────────────────────────────────────────────────────

export {
  useAuthStore,
  selectIsAuthenticated,
  selectIsLoading,
  selectUser,
  selectProfile,
  selectPlanId,
  selectCredits,
  selectIsAdmin,
  selectHasByok,
  selectPreferredModel,
  selectSubscriptionActive,
} from "./authStore";

export type { AuthStatus, AuthState, AuthActions, AuthStore, BYOKKeys } from "./authStore";

export {
  useGlobalStore,
  selectIsAppReady,
  selectIsBooting,
  selectIsOnline,
  selectActiveModal,
  selectIsModalOpen,
  selectFeatureFlag,
  selectBanners,
  selectIsDebug,
  selectIsForcedLoading,
} from "./globalStore";

export type {
  AppLifecycleStatus,
  ModalId,
  ModalState,
  ConnectionStatus,
  BannerType,
  AppBanner,
  GlobalState,
  GlobalActions,
  GlobalStore,
} from "./globalStore";

// ─── Existing ✅ ──────────────────────────────────────────────────────────────

export { useAnswerBankStore }          from "./answerBankStore";
export { useAudioStore }               from "./audioStore";
export { useCoachStore }               from "./coachStore";
export { useDocumentStore }            from "./documentStore";
export { useInterviewSchedulerStore }  from "./interviewSchedulerStore";
export { useNetworkStore }             from "./networkStore";
export { useNotificationStore }        from "./notificationStore";
export { useOverlayStore }             from "./overlayStore";
export { useSessionStore }             from "./sessionStore";
export { useThemeStore }               from "./themeStore";
export { useUIStore }                  from "./uiStore";
export { useUserStore }                from "./userStore";

// ─── App Boot Sequence ────────────────────────────────────────────────────────
//
// Call bootApp() once inside <App /> on mount.
// Order matters:
//   1. Auth (session + profile)       → planId, credits, byok available
//   2. Global (feature flags)         → resolved against planId
//   3. Theme / UI (persisted prefs)   → can read profile.ui_preferences
//   4. Network / Notifications        → background listeners
//
// ─────────────────────────────────────────────────────────────────────────────

export async function bootApp(): Promise<void> {
  const { useAuthStore }   = await import("./authStore");
  const { useGlobalStore } = await import("./globalStore");
  const { useThemeStore }  = await import("./themeStore");
  const { useNetworkStore }= await import("./networkStore");

  const auth    = useAuthStore.getState();
  const global  = useGlobalStore.getState();
  const network = useNetworkStore.getState();

  // 1. Auth — blocks everything else
  await auth.initialize();

  // 2. Feature flags — depends on planId from auth
  const planId = useAuthStore.getState().planId;
  global.resolveFeatureFlags(planId as Parameters<typeof global.resolveFeatureFlags>[0]);

  // 3. Boot global (listeners, banners, perf)
  await global.boot();

  // 4. Apply persisted theme
  const theme = useThemeStore.getState();
  if ("applyTheme" in theme) (theme as { applyTheme: () => void }).applyTheme();

  // 5. Network listeners
  if ("initialize" in network) (network as { initialize: () => void }).initialize();
}

// ─── Dev Helpers ─────────────────────────────────────────────────────────────

if (import.meta.env.DEV) {
  // Expose all stores on window for debugging in the browser console
  if (typeof window !== "undefined") {
    import("./authStore").then(({ useAuthStore }) => {
      (window as Window & { __stores?: Record<string, unknown> }).__stores ??= {};
      (window as Window & { __stores: Record<string, unknown> }).__stores.auth = useAuthStore;
    });
    import("./globalStore").then(({ useGlobalStore }) => {
      (window as Window & { __stores?: Record<string, unknown> }).__stores ??= {};
      (window as Window & { __stores: Record<string, unknown> }).__stores.global = useGlobalStore;
    });
  }
}
