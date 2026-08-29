import { decideFocusRecovery } from "./decideRecovery";
import { ensureAuthSession } from "./sessionRefresh";
import { createAbortableGeneration } from "./staleRequest";
import {
  DEFAULT_FOCUS_RECOVERY_CONFIG,
  type FocusRecoveryConfig,
  type RecoveryAuthContext,
  type RecoveryListener,
  type RecoveryPlan,
  type RecoverySnapshot,
  type RecoveryTrigger,
} from "./types";

export interface FocusRecoveryCoordinator {
  noteHidden(at?: number): void;
  noteVisible(trigger: RecoveryTrigger, options?: { persisted?: boolean }): void;
  requestRecovery(trigger?: RecoveryTrigger): Promise<RecoveryPlan | null>;
  subscribe(listener: RecoveryListener): () => void;
  attachBrowserListeners(): () => void;
  getSnapshot(): RecoverySnapshot;
  getLastPlan(): RecoveryPlan | null;
  simulateReturnAfter(hiddenMs: number): Promise<RecoveryPlan | null>;
  resetForTests(): void;
}

export function createFocusRecoveryCoordinator(options?: {
  now?: () => number;
  isDocumentVisible?: () => boolean;
  config?: Partial<FocusRecoveryConfig>;
  readAuth?: () => RecoveryAuthContext;
  runSessionCheck?: typeof ensureAuthSession;
}): FocusRecoveryCoordinator {
  const config: FocusRecoveryConfig = {
    ...DEFAULT_FOCUS_RECOVERY_CONFIG,
    ...options?.config,
  };
  const now = options?.now ?? (() => Date.now());
  const isDocumentVisible =
    options?.isDocumentVisible ??
    (() =>
      typeof document === "undefined"
        ? true
        : document.visibilityState === "visible");
  const runSessionCheck = options?.runSessionCheck ?? ensureAuthSession;

  const generations = createAbortableGeneration();
  const listeners = new Set<RecoveryListener>();

  let lastHiddenAt: number | null = null;
  let lastVisibleAt: number | null = null;
  let lastRecoveryAt: number | null = null;
  let lastTrigger: RecoveryTrigger | null = null;
  let lastPlan: RecoveryPlan | null = null;
  let recoveryCount = 0;
  let inFlight = false;
  let trailing = false;
  let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTrigger: RecoveryTrigger = "visibility";
  let pendingPersisted = false;

  const defaultReadAuth = (): RecoveryAuthContext => ({
    status: "unauthenticated",
    hasValidProfile: false,
    profileAgeMs: null,
    roleResolved: false,
    sessionExpiresAtMs: null,
  });

  function snapshot(): RecoverySnapshot {
    return {
      generation: generations.current(),
      recoveryCount,
      inFlight,
      lastRecoveryAt,
      lastHiddenAt,
      lastVisibleAt,
      lastTrigger,
    };
  }

  function hiddenDurationMs(at: number): number {
    if (lastHiddenAt == null) return 0;
    return Math.max(0, at - lastHiddenAt);
  }

  function buildPlan(
    trigger: RecoveryTrigger,
    persistedPageshow: boolean,
  ): RecoveryPlan {
    const at = now();
    const auth = (options?.readAuth ?? defaultReadAuth)();
    const decided = decideFocusRecovery({
      now: at,
      isVisible: isDocumentVisible(),
      trigger,
      persistedPageshow,
      hiddenDurationMs: hiddenDurationMs(at),
      msSinceLastRecovery:
        lastRecoveryAt == null ? null : at - lastRecoveryAt,
      inFlight,
      auth,
      config,
    });
    return decided;
  }

  async function runRecovery(
    trigger: RecoveryTrigger,
    persistedPageshow: boolean,
  ): Promise<RecoveryPlan | null> {
    if (!isDocumentVisible()) {
      lastPlan = {
        generation: generations.current(),
        shouldRecover: false,
        reason: "hidden",
        trigger,
        hiddenDurationMs: hiddenDurationMs(now()),
        refreshSession: false,
        revalidate: [],
      };
      return lastPlan;
    }

    if (inFlight) {
      trailing = true;
      pendingTrigger = trigger;
      pendingPersisted = pendingPersisted || persistedPageshow;
      return lastPlan;
    }

    const decided = buildPlan(trigger, persistedPageshow);
    if (!decided.shouldRecover) {
      lastPlan = decided;
      return lastPlan;
    }

    inFlight = true;
    const { generation, signal } = generations.begin();
    const plan: RecoveryPlan = { ...decided, generation };
    lastPlan = plan;
    lastTrigger = trigger;
    lastRecoveryAt = now();
    recoveryCount += 1;

    try {
      const sessionResult = await runSessionCheck({
        forceRefresh: plan.refreshSession,
        now: now(),
      });
      if (signal.aborted) return plan;
      if (sessionResult.expired) {
        return plan;
      }

      const jobs = [...listeners].map((listener) => listener(plan, signal));
      await Promise.allSettled(jobs);
      return plan;
    } finally {
      inFlight = false;
      if (trailing) {
        trailing = false;
        const nextTrigger = pendingTrigger;
        const nextPersisted = pendingPersisted;
        pendingPersisted = false;
        void runRecovery(nextTrigger, nextPersisted);
      }
    }
  }

  function schedule(trigger: RecoveryTrigger, persistedPageshow: boolean): void {
    pendingTrigger = trigger;
    pendingPersisted = pendingPersisted || persistedPageshow;
    if (coalesceTimer) clearTimeout(coalesceTimer);
    coalesceTimer = setTimeout(() => {
      coalesceTimer = null;
      const t = pendingTrigger;
      const p = pendingPersisted;
      pendingPersisted = false;
      void runRecovery(t, p);
    }, config.coalesceMs);
  }

  const api: FocusRecoveryCoordinator = {
    noteHidden(at) {
      lastHiddenAt = at ?? now();
    },
    noteVisible(trigger, opts) {
      lastVisibleAt = now();
      schedule(trigger, Boolean(opts?.persisted));
    },
    async requestRecovery(trigger = "visibility") {
      if (coalesceTimer) {
        clearTimeout(coalesceTimer);
        coalesceTimer = null;
      }
      return runRecovery(trigger, false);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attachBrowserListeners() {
      if (typeof document === "undefined" || typeof window === "undefined") {
        return () => undefined;
      }

      const onVisibility = () => {
        if (document.visibilityState === "hidden") {
          api.noteHidden();
          return;
        }
        if (document.visibilityState === "visible") {
          api.noteVisible("visibility");
        }
      };

      const onFocus = () => {
        if (document.visibilityState !== "visible") return;
        api.noteVisible("focus");
      };

      const onPageShow = (event: Event) => {
        const persisted =
          "persisted" in event && Boolean((event as PageTransitionEvent).persisted);
        if (document.visibilityState !== "visible") return;
        api.noteVisible("pageshow", { persisted });
      };

      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", onFocus);
      window.addEventListener("pageshow", onPageShow);

      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("pageshow", onPageShow);
        if (coalesceTimer) {
          clearTimeout(coalesceTimer);
          coalesceTimer = null;
        }
      };
    },
    getSnapshot: snapshot,
    getLastPlan() {
      return lastPlan;
    },
    async simulateReturnAfter(hiddenMs: number) {
      const at = now();
      lastHiddenAt = at - hiddenMs;
      lastVisibleAt = at;
      return runRecovery("visibility", false);
    },
    resetForTests() {
      if (coalesceTimer) {
        clearTimeout(coalesceTimer);
        coalesceTimer = null;
      }
      generations.abort();
      listeners.clear();
      lastHiddenAt = null;
      lastVisibleAt = null;
      lastRecoveryAt = null;
      lastTrigger = null;
      lastPlan = null;
      recoveryCount = 0;
      inFlight = false;
      trailing = false;
      pendingPersisted = false;
    },
  };
  return api;
}

let singleton: FocusRecoveryCoordinator | null = null;
let detachBrowser: (() => void) | null = null;
let authReader: () => RecoveryAuthContext = () => ({
  status: "unauthenticated",
  hasValidProfile: false,
  profileAgeMs: null,
  roleResolved: false,
  sessionExpiresAtMs: null,
});

export function getFocusRecoveryCoordinator(): FocusRecoveryCoordinator {
  if (!singleton) {
    singleton = createFocusRecoveryCoordinator({
      readAuth: () => authReader(),
    });
  }
  return singleton;
}

export function startFocusRecoveryCoordinator(readAuth: () => RecoveryAuthContext): () => void {
  authReader = readAuth;
  const coordinator = getFocusRecoveryCoordinator();
  if (detachBrowser) return detachBrowser;

  detachBrowser = coordinator.attachBrowserListeners();

  if (typeof window !== "undefined") {
    (
      window as unknown as {
        __clarifyFocusRecovery?: Record<string, unknown>;
      }
    ).__clarifyFocusRecovery = {
      getSnapshot: () => singleton?.getSnapshot(),
      getLastPlan: () => singleton?.getLastPlan(),
      getRecoveryCount: () => singleton?.getSnapshot().recoveryCount ?? 0,
      simulateReturnAfter: (ms: number) => singleton?.simulateReturnAfter(ms),
      requestRecovery: () => singleton?.requestRecovery(),
      forceRefreshSession: () => ensureAuthSession({ forceRefresh: true }),
    };
  }

  return () => {
    detachBrowser?.();
    detachBrowser = null;
  };
}

export function subscribeFocusRecovery(listener: RecoveryListener): () => void {
  return getFocusRecoveryCoordinator().subscribe(listener);
}

export function __resetFocusRecoverySingletonForTests(): void {
  detachBrowser?.();
  detachBrowser = null;
  singleton?.resetForTests();
  singleton = null;
  if (typeof window !== "undefined") {
    delete (window as unknown as { __clarifyFocusRecovery?: unknown })
      .__clarifyFocusRecovery;
  }
}
