/**
 * Prefetch lazy route chunks before navigation so the URL and content stay in sync.
 * Used by sidebar, mobile nav, and idle warm-up after AppShell mounts.
 */

const ROUTE_PREFETCH: Record<string, () => Promise<unknown>> = {
  "/app/dashboard": () => import("@/pages/app/Dashboard"),
  "/app/live": () => import("@/pages/app/live/LiveRehearsal"),
  "/app/mock": () => import("@/pages/app/mock/MockInterview"),
  "/app/prep": () => import("@/pages/app/prep/PrepLab"),
  "/app/mock-test": () => import("@/pages/app/mock-test/MockTestHub"),
  "/app/mock-test/generate": () => import("@/pages/app/mock-test/GenerateGovPaper"),
  "/app/assessments": () => import("@/pages/app/assessments/AssessmentTemplates"),
  "/app/learn": () => import("@/pages/app/learn/LearningHub"),
  "/app/practice-workspace": () => import("@/pages/app/practice/PracticeWorkspace"),
  "/app/plan": () => import("@/pages/app/plan/InterviewPracticePlan"),
  "/app/analytics": () => import("@/pages/app/Analytics"),
  "/app/companies": () => import("@/pages/app/company-research/CompanyResearch"),
  "/app/answers": () => import("@/pages/app/answer-bank/AnswerBank"),
  "/app/settings": () => import("@/pages/app/settings/Settings"),
  "/app/settings/profile": () => import("@/pages/app/settings/SettingsProfile"),
  "/app/sessions": () => import("@/pages/app/sessions/CallSessions"),
  "/app/documents": () => import("@/pages/app/documents/Documents"),
  "/app/usage": () => import("@/pages/app/usage/UsageDashboard"),
  "/app/debriefs": () => import("@/pages/app/debrief/Debrief"),
  "/app/question-bank": () => import("@/pages/app/question-bank/QuestionBank"),
  "/app/community": () => import("@/pages/app/community/Community"),
  "/app/coding": () => import("@/pages/app/coding/CodingLab"),
  "/app/library": () => import("@/pages/app/library/DocumentLibrary"),
  "/app/interview-day": () => import("@/pages/app/InterviewDay"),
  "/app/interviews": () => import("@/pages/app/interviews/Interviews"),
  "/app/notifications": () => import("@/pages/app/Notifications"),
  "/app/referrals": () => import("@/pages/app/Referrals"),
  "/app/guide/practice-coach": () => import("@/pages/app/guide/PracticeCoachGuide"),
  "/app/admin": () => import("@/pages/app/admin/AdminDashboard"),
  "/app/admin/mail": () => import("@/pages/app/admin/AdminMail"),
  "/app/admin/live-chat": () => import("@/pages/app/admin/AdminLiveChat"),
  "/app/admin/users": () => import("@/pages/app/admin/AdminUsers"),
  "/app/admin/gov/exams": () => import("@/pages/app/admin/AdminGovExamRegistry"),
  "/app/admin/support": () => import("@/pages/app/admin/AdminSupport"),
  "/app/admin/questions": () => import("@/pages/app/admin/AdminQuestionEditor"),
  "/app/admin/analytics": () => import("@/pages/app/admin/AdminAnalytics"),
  "/app/admin/community": () => import("@/pages/app/admin/AdminCommunity"),
};

/** Routes warmed in the background after AppShell mounts. */
const COMMON_IDLE_PREFETCH = [
  "/app/dashboard",
  "/app/mock",
  "/app/prep",
  "/app/mock-test",
  "/app/sessions",
  "/app/documents",
  "/app/settings",
] as const;

const inFlight = new Set<string>();

function normalizeAppPath(path: string): string {
  const base = path.split("?")[0]?.split("#")[0] ?? path;
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}

function resolvePrefetchLoader(path: string): (() => Promise<unknown>) | undefined {
  const normalized = normalizeAppPath(path);
  if (ROUTE_PREFETCH[normalized]) return ROUTE_PREFETCH[normalized];

  const prefix = Object.keys(ROUTE_PREFETCH)
    .filter((key) => normalized.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];

  return prefix ? ROUTE_PREFETCH[prefix] : undefined;
}

/** Start downloading a route chunk if not already cached or in flight. */
export function prefetchRoute(path: string): void {
  const normalized = normalizeAppPath(path);
  const loader = resolvePrefetchLoader(normalized);
  if (!loader || inFlight.has(normalized)) return;

  inFlight.add(normalized);
  void loader().finally(() => {
    inFlight.delete(normalized);
  });
}

/** Hover / focus / touch handlers for nav links. */
export function routePrefetchHandlers(path: string): {
  onMouseEnter: () => void;
  onFocus: () => void;
  onTouchStart: () => void;
} {
  return {
    onMouseEnter: () => prefetchRoute(path),
    onFocus: () => prefetchRoute(path),
    onTouchStart: () => prefetchRoute(path),
  };
}

/** Warm frequently visited routes during browser idle time. */
export function prefetchCommonRoutesIdle(): void {
  const run = (): void => {
    for (const path of COMMON_IDLE_PREFETCH) {
      prefetchRoute(path);
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
    return;
  }

  window.setTimeout(run, 800);
}
