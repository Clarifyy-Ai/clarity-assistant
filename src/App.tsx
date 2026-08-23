import {
  lazy,
  Suspense,
  useEffect,
  type ComponentType,
  type CSSProperties,
} from "react";
import {
  createBrowserRouter,
  createHashRouter,
  RouterProvider,
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";

import { cn } from "@/lib/utils";
import { useFocusRecoveryCoordinator } from "@/hooks/useFocusRecoveryCoordinator";
import { useAuthStore } from "@/store/authStore";
import { useGlobalStore } from "@/store/globalStore";
import { useUIStore } from "@/store/uiStore";
import { useThemeStore } from "@/store/themeStore";
import { applyAppearancePreferences } from "@/lib/theme/applyAppearance";
import { syncStealthFromOverlay } from "@/lib/stealth/stealthActions";
import type { PlanId } from "@/lib/constants/pricing";
import { useOverlayStore } from "@/store/overlayStore";
import { toast } from "sonner";
import { RETIRED_ROOMS_REDIRECT, RETIRED_ROOMS_TOAST } from "@/lib/routes/canonical";

import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { FeatureKillGate } from "@/components/layout/PlanGate";
import { WhatsNewModal, useWhatsNewPrompt } from "@/components/common/WhatsNewModal";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { MobileNav } from "@/components/layout/MobileNav";
import { IndiaRegionGate } from "@/components/layout/IndiaRegionGate";
import { NetworkBanner } from "@/components/layout/NetworkBanner";
import { SessionTimeoutBanner } from "@/components/layout/SessionTimeoutBanner";
import { PageContent } from "@/components/layout/PageContent";
import { SetupChecklist } from "@/components/layout/SetupChecklist";
import { AppWalkthrough, InstallPromptModal, ElectronFirstRunModal } from "@/components/onboarding";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { GlobalErrorBoundary } from "@/components/layout/GlobalErrorBoundary";
import { AppLoadingFallback } from "@/components/layout/AppLoadingFallback";
import { Toaster } from "@/components/ui/sonner";
import { TabAudioGuideHost } from "@/components/audio/TabAudioGuideHost";
import { isElectronApp } from "@/lib/platform/isElectron";
import LoginPage from "@/pages/auth/Login";
import DashboardPage from "@/pages/app/Dashboard";
import { ElectronRouteGate } from "@/components/layout/ElectronRouteGate";
import { AppHotkeyListener } from "@/components/layout/AppHotkeyListener";
import { PANIC_RESPONSE } from "@/types/session.types";

// ✅ FIX P0-A: Marketing routes load eagerly (no lazy chunk on first paint).
import Landing from "@/pages/marketing/Landing";
import Pricing from "@/pages/marketing/Pricing";
import Help from "@/pages/marketing/Help";
import HelpArticle from "@/pages/marketing/HelpArticle";
import Shortcuts from "@/pages/marketing/Shortcuts";
import Blog from "@/pages/marketing/Blog";
import BlogPost from "@/pages/marketing/BlogPost";
import Terms from "@/pages/marketing/Terms";
import Privacy from "@/pages/marketing/Privacy";
import GovExams from "@/pages/marketing/GovExams";

// ─────────────────────────────────────────────────────────────────────────────
// Electron typing
// ─────────────────────────────────────────────────────────────────────────────

type ElectronAPI = {
  isElectron?: boolean;
  platform?: string;
  show?: () => void;
  showInactive?: () => void;
  hide?: () => void;
  quit?: () => void;
  resize?: (w: number, h: number) => void;
  setAlwaysOnTop?: (enabled: boolean, level?: "floating" | "normal") => void;
  setFocusable?: (focusable: boolean) => void;
  onGlobalShortcut?: (callback: (action: string) => void) => void;
  removeGlobalShortcutListener?: () => void;
  onHotkeyConflict?: (callback: (info: { key: string; action: string }) => void) => void;
  removeHotkeyConflictListener?: () => void;
  syncGlobalShortcuts?: (
    bindings: Array<{ accelerator: string; action: string }>,
  ) => Promise<void>;
};

type ElectronWindow = Window & {
  electronAPI?: ElectronAPI;
};

const electronWindow = window as ElectronWindow;
const IS_ELECTRON = isElectronApp();

// ─────────────────────────────────────────────────────────────────────────────
// Lazy page imports
// ─────────────────────────────────────────────────────────────────────────────

// Auth
const Login = IS_ELECTRON ? LoginPage : lazy(() => import("@/pages/auth/Login"));
const Signup = lazy(() => import("@/pages/auth/Signup"));
const VerifyEmail = lazy(() => import("@/pages/auth/VerifyEmail"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const AuthCallback = lazy(() => import("@/pages/auth/AuthCallback"));

// Onboarding
const OnboardingIndex = lazy(
  () => import("@/pages/onboarding/OnboardingIndex")
);

// App — top-level
const Dashboard = IS_ELECTRON ? DashboardPage : lazy(() => import("@/pages/app/Dashboard"));
const Analytics = lazy(() => import("@/pages/app/Analytics"));
const UsageDashboard = lazy(
  () => import("@/pages/app/usage/UsageDashboard")
);
const InterviewDay = lazy(() => import("@/pages/app/InterviewDay"));
const Notifications = lazy(() => import("@/pages/app/Notifications"));
const Referrals = lazy(() => import("@/pages/app/Referrals"));

// Live
const LiveRehearsal = lazy(() => import("@/pages/app/live/LiveRehearsal"));
const LiveOverlay = lazy(() => import("@/pages/app/live/LiveOverlay"));

// Mock
const MockInterview = lazy(() => import("@/pages/app/mock/MockInterview"));
const MockSession = lazy(() => import("@/pages/app/mock/MockSession"));
const MockWarmup = lazy(() => import("@/pages/app/mock/MockWarmup"));

// Mock Test Engine (JEE/NEET MCQ) — restored.
const MockTestHub = lazy(() => import("@/pages/app/mock-test/MockTestHub"));
const MockTestConfigure = lazy(() => import("@/pages/app/mock-test/TestConfigure"));
const MockTestSession = lazy(() => import("@/pages/app/mock-test/TestSession"));
const MockTestResults = lazy(() => import("@/pages/app/mock-test/TestResults"));
const MockTestMyQuestions = lazy(() => import("@/pages/app/mock-test/MyQuestions"));
const MockTestUpload = lazy(() => import("@/pages/app/mock-test/UploadQuestions"));
const MockTestRevision = lazy(() => import("@/pages/app/mock-test/TestRevision"));
const MockTestAnalytics = lazy(() => import("@/pages/app/mock-test/TestAnalytics"));
const MockTestPapers = lazy(() => import("@/pages/app/mock-test/ExamPapers"));
const GovExamDetail = lazy(() => import("@/pages/app/mock-test/GovExamDetail"));
const GenerateGovPaper = lazy(() => import("@/pages/app/mock-test/GenerateGovPaper"));
const InterviewPracticePlan = lazy(() => import("@/pages/app/plan/InterviewPracticePlan"));
const QuestionBank = lazy(() => import("@/pages/app/question-bank/QuestionBank"));
const AssessmentTemplates = lazy(() => import("@/pages/app/assessments/AssessmentTemplates"));
const LearningHub = lazy(() => import("@/pages/app/learn/LearningHub"));
const CourseDetail = lazy(() => import("@/pages/app/learn/CourseDetail"));
const LessonPlayer = lazy(() => import("@/pages/app/learn/LessonPlayer"));
const Community = lazy(() => import("@/pages/app/community/Community"));
const CommunityPost = lazy(() => import("@/pages/app/community/PostDetail"));
const CodingLab = lazy(() => import("@/pages/app/coding/CodingLab"));
const CodingAssessment = lazy(() => import("@/pages/app/coding/CodingAssessment"));
const DocumentLibrary = lazy(() => import("@/pages/app/library/DocumentLibrary"));
const PracticeWorkspace = lazy(() => import("@/pages/app/practice/PracticeWorkspace"));
const VerifyCertificate = lazy(() => import("@/pages/public/VerifyCertificate"));

// Prep
const PrepLab = lazy(() => import("@/pages/app/prep/PrepLab"));
const StarBuilder = lazy(() => import("@/pages/app/prep/StarBuilder"));
const ProjectBuilder = lazy(
  () => import("@/pages/app/prep/ProjectBuilder")
);
const Rephraser = lazy(() => import("@/pages/app/prep/Rephraser"));
const CodingHints = lazy(() => import("@/pages/app/prep/CodingHints"));
const SystemDesign = lazy(() => import("@/pages/app/prep/SystemDesign"));

// Sessions
const CallSessions = lazy(
  () => import("@/pages/app/sessions/CallSessions")
);
const SessionDetail = lazy(
  () => import("@/pages/app/sessions/SessionDetail")
);

// Documents
const Documents = lazy(() => import("@/pages/app/documents/Documents"));
const ResumeDetail = lazy(
  () => import("@/pages/app/documents/ResumeDetail")
);
const JDDetail = lazy(() => import("@/pages/app/documents/JDDetail"));

// Answer Bank
const AnswerBank = lazy(
  () => import("@/pages/app/answer-bank/AnswerBank")
);
const AnswerDetail = lazy(
  () => import("@/pages/app/answer-bank/AnswerDetail")
);

// Interviews
const Interviews = lazy(
  () => import("@/pages/app/interviews/Interviews")
);
const NewInterview = lazy(
  () => import("@/pages/app/interviews/NewInterview")
);
const InterviewDetail = lazy(
  () => import("@/pages/app/interviews/InterviewDetail")
);

// Company Research
const CompanyResearch = lazy(
  () => import("@/pages/app/company-research/CompanyResearch")
);
const CompanyProfile = lazy(
  () => import("@/pages/app/company-research/CompanyProfile")
);

// Debrief
const Debrief = lazy(() => import("@/pages/app/debrief/Debrief"));
const DebriefDetail = lazy(
  () => import("@/pages/app/debrief/DebriefDetail")
);
// Settings
const Settings = lazy(() => import("@/pages/app/settings/Settings"));
const SettingsProfile = lazy(
  () => import("@/pages/app/settings/SettingsProfile")
);
const SettingsAudio = lazy(
  () => import("@/pages/app/settings/SettingsAudio")
);
const SettingsModels = lazy(
  () => import("@/pages/app/settings/SettingsModels")
);
const SettingsBilling = lazy(
  () => import("@/pages/app/settings/SettingsBilling")
);
const SettingsNotifications = lazy(
  () => import("@/pages/app/settings/SettingsNotifications")
);
const SettingsPrivacy = lazy(
  () => import("@/pages/app/settings/SettingsPrivacy")
);
const SettingsSecurity = lazy(
  () => import("@/pages/app/settings/SettingsSecurity")
);
const SettingsSecurityConfig = lazy(
  () => import("@/pages/app/settings/SettingsSecurityConfig")
);
const SettingsIntegrations = lazy(
  () => import("@/pages/app/settings/SettingsIntegrations")
);
const SettingsAppearance = lazy(
  () => import("@/pages/app/settings/SettingsAppearance")
);
const SettingsData = lazy(
  () => import("@/pages/app/settings/SettingsData")
);
const SettingsDanger = lazy(
  () => import("@/pages/app/settings/SettingsDanger")
);
const SettingsHotkeys = lazy(
  () => import("@/pages/app/settings/SettingsHotkeys")
);
const SettingsPolish = lazy(
  () => import("@/pages/app/settings/SettingsPolish")
);
const SettingsPracticeCoach = lazy(
  () => import("@/pages/app/settings/SettingsPracticeCoach")
);

// Guide / Admin / Scorecard / 404
const Guide = lazy(() => import("@/pages/app/guide/Guide"));
const PracticeCoachGuide = lazy(
  () => import("@/pages/app/guide/PracticeCoachGuide"),
);
const AdminDashboard = lazy(
  () => import("@/pages/app/admin/AdminDashboard")
);
const AdminUsers = lazy(() => import("@/pages/app/admin/AdminUsers"));
const AdminAnalytics = lazy(
  () => import("@/pages/app/admin/AdminAnalytics")
);
const AdminRevenue = lazy(
  () => import("@/pages/app/admin/AdminRevenue")
);
const AdminModelCosts = lazy(
  () => import("@/pages/app/admin/AdminModelCosts")
);
const AdminAiHub = lazy(() => import("@/pages/app/admin/AdminAiHub"));
const AdminFeatureFlags = lazy(
  () => import("@/pages/app/admin/AdminFeatureFlags")
);
const AdminSeedQuestions = lazy(
  () => import("@/pages/app/admin/AdminSeedQuestions")
);
const AdminBulkUpload = lazy(
  () => import("@/pages/app/admin/AdminBulkUpload")
);
const AdminLiveChat = lazy(
  () => import("@/pages/app/admin/AdminLiveChat")
);
const AdminQuestionEditor = lazy(
  () => import("@/pages/app/admin/AdminQuestionEditor")
);
const AdminCommunity = lazy(() => import("@/pages/app/admin/AdminCommunity"));
const AdminLearning = lazy(() => import("@/pages/app/admin/AdminLearning"));
const AdminAuditLog = lazy(() => import("@/pages/app/admin/AdminAuditLog"));
const AdminQAChecklist = lazy(
  () => import("@/pages/app/admin/AdminQAChecklist")
);
const AdminSupport = lazy(() => import("@/pages/app/admin/AdminSupport"));
const AdminPromoCodes = lazy(() => import("@/pages/app/admin/AdminPromoCodes"));
const AdminBillingSettings = lazy(
  () => import("@/pages/app/admin/AdminBillingSettings"),
);
const AdminGovSources = lazy(() => import("@/pages/app/admin/AdminGovSources"));
const AdminGovIngest = lazy(() => import("@/pages/app/admin/AdminGovIngest"));
const AdminGovExamRegistry = lazy(
  () => import("@/pages/app/admin/AdminGovExamRegistry"),
);
const AdminGovQuestionReview = lazy(
  () => import("@/pages/app/admin/AdminGovQuestionReview"),
);
const AdminGovPaperReview = lazy(
  () => import("@/pages/app/admin/AdminGovPaperReview"),
);
const AdminGovTranslationReview = lazy(
  () => import("@/pages/app/admin/AdminGovTranslationReview"),
);
const AdminLayout = lazy(() => import("@/pages/app/admin/AdminLayout"));
const Scorecard = lazy(() => import("@/pages/Scorecard"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const SharedDebrief = lazy(() => import("@/pages/marketing/SharedDebrief"));
const UpgradeModal = lazy(() =>
  import("@/components/billing/UpgradeModal").then((mod) => ({
    default: mod.UpgradeModal,
  })),
);

// ─────────────────────────────────────────────────────────────────────────────
// Loaders
// ─────────────────────────────────────────────────────────────────────────────

function PageLoader(): JSX.Element {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function Page({ component: Component }: { component: ComponentType }): JSX.Element {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function MarketingPage({ component: Component }: { component: ComponentType }): JSX.Element {
  return <Component />;
}

function IndiaAppPage({ component: Component }: { component: ComponentType }): JSX.Element {
  return (
    <IndiaRegionGate>
      <Page component={Component} />
    </IndiaRegionGate>
  );
}

function OnboardingRedirect(): JSX.Element {
  const location = useLocation();

  return <Navigate to={`/onboarding${location.search}`} replace />;
}

function AnalyticsDebriefRedirect(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <Navigate to={`/app/debriefs/${sessionId ?? ""}`} replace />;
}

function AnswerBankLegacyRedirect(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/app/answers/${id ?? ""}`} replace />;
}

function DebriefLegacyRedirect(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/app/debriefs/${id ?? ""}`} replace />;
}

function RetiredRoomsRedirect(): JSX.Element {
  useEffect(() => {
    try {
      if (!sessionStorage.getItem("clarify:rooms-retired-notice")) {
        sessionStorage.setItem("clarify:rooms-retired-notice", "1");
        toast.message(RETIRED_ROOMS_TOAST);
      }
    } catch {
      toast.message(RETIRED_ROOMS_TOAST);
    }
  }, []);
  return <Navigate to={RETIRED_ROOMS_REDIRECT} replace />;
}

// ─────────────────────────────────────────────────────────────────────────────
// App shell
// ─────────────────────────────────────────────────────────────────────────────

function AppShell(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const location = useLocation();
  const whatsNew = useWhatsNewPrompt();

  const mobileNavOpen = useUIStore((state) => state.mobile_nav_open);
  const setMobileNavOpen = useUIStore((state) => state.setMobileNavOpen);

  // Mid-session Practice Coach always runs on /app/live/overlay (outside AppShell).
  // /app/live is setup + post-session summary only — keep chrome visible there.
  const hideChromeForLiveSession = false;

  const showSetupChecklist =
    Boolean(profile) &&
    !profile?.onboarding_completed &&
    !location.pathname.startsWith("/app/dashboard") &&
    !hideChromeForLiveSession;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "b") {
        event.preventDefault();
        useUIStore.getState().toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Close obsolete mobile sidebar drawer if left open from a previous session
  useEffect(() => {
    if (mobileNavOpen) setMobileNavOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (IS_ELECTRON || hideChromeForLiveSession) {
    return (
      <div
        className={cn(
          "flex h-[100vh] w-full overflow-hidden",
          IS_ELECTRON ? "electron-shell bg-background" : "bg-background",
        )}
      >
        {IS_ELECTRON && (
          <div
            style={{ WebkitAppRegion: "drag" } as CSSProperties}
            className="fixed top-0 left-0 right-0 h-8 z-[9999] pointer-events-none"
          />
        )}
        <SessionTimeoutBanner />
        <NetworkBanner />
        <AppHotkeyListener />
        <main id="main-content" className="flex-1 overflow-y-auto min-w-0">
          <Suspense fallback={<AppLoadingFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-[100vh] w-full overflow-hidden",
        IS_ELECTRON ? "electron-shell" : "bg-background"
      )}
    >
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium">
        Skip to content
      </a>
      {IS_ELECTRON && (
        <div
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
          className="fixed top-0 left-0 right-0 h-8 z-[9999] pointer-events-none"
        />
      )}

      {/* Desktop sidebar only — mobile uses bottom MobileNav + More sheet */}
      <AppSidebar />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <AppTopBar />
        <SessionTimeoutBanner />
        <NetworkBanner />
        <AppHotkeyListener />

        <main id="main-content" className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
            {showSetupChecklist && (
              <div className="mb-6">
                <SetupChecklist prominent dismissible />
              </div>
            )}

            <PageContent>
              <Suspense fallback={<AppLoadingFallback />}>
                <Outlet />
              </Suspense>
            </PageContent>
          </div>
        </main>
      </div>

      <MobileNav />
      <Suspense fallback={null}>
        <UpgradeModal />
      </Suspense>
      <AppWalkthrough />
      <InstallPromptModal />
      <WhatsNewModal open={whatsNew.open} onDismiss={whatsNew.dismiss} />
      <SupportChatWidget />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppress only React Router future-flag warning
// ─────────────────────────────────────────────────────────────────────────────

const originalConsoleWarn = console.warn.bind(console);

console.warn = (...args: unknown[]) => {
  if (
    typeof args[0] === "string" &&
    args[0].includes("React Router Future Flag Warning")
  ) {
    return;
  }

  originalConsoleWarn(...args);
};

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

const routes = [
  {
    element: <ElectronRouteGate />,
    children: [
  // Marketing
  { path: "/", element: <MarketingPage component={Landing} /> },
  { path: "/pricing", element: <MarketingPage component={Pricing} /> },
  { path: "/gov-exams", element: <MarketingPage component={GovExams} /> },
  { path: "/help", element: <MarketingPage component={Help} /> },
  { path: "/help/:slug", element: <MarketingPage component={HelpArticle} /> },
  { path: "/shortcuts", element: <MarketingPage component={Shortcuts} /> },
  { path: "/blog", element: <MarketingPage component={Blog} /> },
  { path: "/blog/:slug", element: <MarketingPage component={BlogPost} /> },
  { path: "/terms", element: <MarketingPage component={Terms} /> },
  { path: "/privacy", element: <MarketingPage component={Privacy} /> },
  { path: "/share/:token", element: <Page component={SharedDebrief} /> },
  { path: "/verify-certificate/:certificateId", element: <Page component={VerifyCertificate} /> },

  { path: "/dashboard", element: <Navigate to="/app/dashboard" replace /> },

  // Auth
  { path: "/login", element: <Page component={Login} /> },
  { path: "/signup", element: <Page component={Signup} /> },
  { path: "/verify-email", element: <Page component={VerifyEmail} /> },
  { path: "/forgot-password", element: <Page component={ResetPassword} /> },
  { path: "/reset-password", element: <Page component={ResetPassword} /> },
  { path: "/auth/callback", element: <Page component={AuthCallback} /> },

  // Onboarding — authenticated + email verified (unverified users stay on /verify-email)
  {
    element: <ProtectedRoute requireEmailVerification />,
    children: [
      { path: "/onboarding", element: <Page component={OnboardingIndex} /> },
      { path: "/onboarding/step-1", element: <OnboardingRedirect /> },
      { path: "/onboarding/step-2", element: <OnboardingRedirect /> },
      { path: "/onboarding/step-3", element: <OnboardingRedirect /> },
      { path: "/onboarding/step-4", element: <OnboardingRedirect /> },
      { path: "/onboarding/step-5", element: <OnboardingRedirect /> },
    ],
  },

  // Full-screen protected routes (verified + onboarded)
  {
    element: <ProtectedRoute requireOnboarded requireEmailVerification />,
    children: [
      {
        path: "/app/live/overlay",
        element: (
          <FeatureKillGate flag="overlay">
            <Page component={LiveOverlay} />
          </FeatureKillGate>
        ),
      },
      {
        path: "/app/mock-test/session/:testId",
        element: <IndiaAppPage component={MockTestSession} />,
      },
      {
        path: "/app/assessments/session/:testId",
        element: <Page component={MockTestSession} />,
      },
    ],
  },

  // Main app shell
  {
    path: "/app",
    element: <ProtectedRoute requireOnboarded requireEmailVerification />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },

          { path: "dashboard", element: <Page component={Dashboard} /> },
          { path: "interview-day", element: <Page component={InterviewDay} /> },
          {
            path: "analytics",
            element: (
              <FeatureKillGate flag="analytics">
                <Page component={Analytics} />
              </FeatureKillGate>
            ),
          },
          {
            path: "analytics/:sessionId",
            element: <AnalyticsDebriefRedirect />,
          },
          { path: "usage", element: <Page component={UsageDashboard} /> },
          { path: "profile", element: <Navigate to="/app/settings/profile" replace /> },
          {
            path: "billing",
            element: <Navigate to="/app/settings/billing" replace />,
          },
          {
            path: "subscription",
            element: <Navigate to="/app/settings/billing" replace />,
          },
          { path: "notifications", element: <Page component={Notifications} /> },
          { path: "referrals", element: <Page component={Referrals} /> },
          {
            path: "live",
            element: (
              <FeatureKillGate flag="overlay">
                <Page component={LiveRehearsal} />
              </FeatureKillGate>
            ),
          },

          {
            path: "mock",
            element: (
              <FeatureKillGate flag="mock_sessions">
                <Page component={MockInterview} />
              </FeatureKillGate>
            ),
          },
          {
            path: "mock/warmup",
            element: (
              <FeatureKillGate flag="mock_sessions">
                <Page component={MockWarmup} />
              </FeatureKillGate>
            ),
          },
          { path: "mock/session", element: <Navigate to="/app/mock" replace /> },
          {
            path: "mock/session/:sessionId",
            element: (
              <FeatureKillGate flag="mock_sessions">
                <Page component={MockSession} />
              </FeatureKillGate>
            ),
          },

          // Mock Test (Gov exams)
          { path: "mock-test", element: <IndiaAppPage component={MockTestHub} /> },
          { path: "mock-test/configure", element: <IndiaAppPage component={MockTestConfigure} /> },
          { path: "mock-test/exam/:examCode", element: <IndiaAppPage component={GovExamDetail} /> },
          { path: "mock-test/generate", element: <IndiaAppPage component={GenerateGovPaper} /> },
          { path: "mock-test/results/:testId", element: <IndiaAppPage component={MockTestResults} /> },
          { path: "mock-test/my-questions", element: <IndiaAppPage component={MockTestMyQuestions} /> },
          { path: "mock-test/upload", element: <IndiaAppPage component={MockTestUpload} /> },
          { path: "mock-test/revision", element: <IndiaAppPage component={MockTestRevision} /> },
          { path: "mock-test/analytics", element: <IndiaAppPage component={MockTestAnalytics} /> },
          { path: "mock-test/papers/:examType", element: <IndiaAppPage component={MockTestPapers} /> },

          { path: "prep", element: <Page component={PrepLab} /> },
          {
            path: "prep/star-builder",
            element: <Page component={StarBuilder} />,
          },
          {
            path: "prep/project-builder",
            element: <Page component={ProjectBuilder} />,
          },
          { path: "prep/rephraser", element: <Page component={Rephraser} /> },
          {
            path: "prep/coding-hints",
            element: (
              <FeatureKillGate flag="coding_hints">
                <Page component={CodingHints} />
              </FeatureKillGate>
            ),
          },
          {
            path: "prep/system-design",
            element: <Page component={SystemDesign} />,
          },

          { path: "sessions", element: <Page component={CallSessions} /> },
          {
            path: "sessions/history",
            element: <Navigate to="/app/sessions?tab=all" replace />,
          },
          {
            path: "sessions/schedule",
            element: <Navigate to="/app/interviews/new" replace />,
          },
          { path: "sessions/:id", element: <Page component={SessionDetail} /> },

          { path: "documents", element: <Page component={Documents} /> },
          {
            path: "documents/resume/:id",
            element: <Page component={ResumeDetail} />,
          },
          { path: "documents/jd/:id", element: <Page component={JDDetail} /> },

          {
            path: "answers",
            element: (
              <FeatureKillGate flag="answer_bank">
                <Page component={AnswerBank} />
              </FeatureKillGate>
            ),
          },
          {
            path: "answers/:id",
            element: (
              <FeatureKillGate flag="answer_bank">
                <Page component={AnswerDetail} />
              </FeatureKillGate>
            ),
          },
          {
            path: "answer-bank",
            element: <Navigate to="/app/answers" replace />,
          },
          {
            path: "answer-bank/:id",
            element: <AnswerBankLegacyRedirect />,
          },

          { path: "interviews", element: (
            <FeatureKillGate flag="calendar_sync">
              <Page component={Interviews} />
            </FeatureKillGate>
          ) },
          {
            path: "interviews/new",
            element: (
              <FeatureKillGate flag="calendar_sync">
                <Page component={NewInterview} />
              </FeatureKillGate>
            ),
          },
          {
            path: "interviews/:id/edit",
            element: (
              <FeatureKillGate flag="calendar_sync">
                <Page component={NewInterview} />
              </FeatureKillGate>
            ),
          },
          {
            path: "interviews/:id",
            element: (
              <FeatureKillGate flag="calendar_sync">
                <Page component={InterviewDetail} />
              </FeatureKillGate>
            ),
          },

          {
            path: "companies",
            element: (
              <FeatureKillGate flag="company_research">
                <Page component={CompanyResearch} />
              </FeatureKillGate>
            ),
          },
          {
            path: "companies/:id",
            element: (
              <FeatureKillGate flag="company_research">
                <Page component={CompanyProfile} />
              </FeatureKillGate>
            ),
          },

          {
            path: "scorecard/:sessionId",
            element: <Page component={Scorecard} />,
          },

          { path: "debriefs", element: <Page component={Debrief} /> },
          { path: "debriefs/:id", element: <Page component={DebriefDetail} /> },
          { path: "plan", element: <Page component={InterviewPracticePlan} /> },
          { path: "question-bank", element: <Page component={QuestionBank} /> },
          { path: "assessments", element: <Page component={AssessmentTemplates} /> },
          { path: "assessments/results/:testId", element: <Page component={MockTestResults} /> },
          { path: "learn", element: <Page component={LearningHub} /> },
          { path: "learn/:courseId", element: <Page component={CourseDetail} /> },
          { path: "learn/:courseId/lesson/:lessonId", element: <Page component={LessonPlayer} /> },
          { path: "community", element: <Page component={Community} /> },
          { path: "community/:postId", element: <Page component={CommunityPost} /> },
          {
            path: "coding",
            element: (
              <FeatureKillGate flag="coding_hints">
                <Page component={CodingLab} />
              </FeatureKillGate>
            ),
          },
          {
            path: "coding/:questionId",
            element: (
              <FeatureKillGate flag="coding_hints">
                <Page component={CodingAssessment} />
              </FeatureKillGate>
            ),
          },
          { path: "library", element: <Page component={DocumentLibrary} /> },
          { path: "practice-workspace", element: <Page component={PracticeWorkspace} /> },
          {
            path: "debrief",
            element: <Navigate to="/app/debriefs" replace />,
          },
          {
            path: "debrief/:id",
            element: <DebriefLegacyRedirect />,
          },

          { path: "guide", element: <Page component={Guide} /> },
          { path: "guide/practice-coach", element: <Page component={PracticeCoachGuide} /> },
          { path: "rooms", element: <RetiredRoomsRedirect /> },
          { path: "rooms/*", element: <RetiredRoomsRedirect /> },

          {
            path: "settings",
            element: <Page component={Settings} />,
            children: [
              { index: true, element: <Navigate to="profile" replace /> },
              { path: "profile", element: <Page component={SettingsProfile} /> },
              { path: "audio", element: <Page component={SettingsAudio} /> },
              {
                path: "practice-coach",
                element: <Page component={SettingsPracticeCoach} />,
              },
              { path: "models", element: <Page component={SettingsModels} /> },
              { path: "billing", element: <Page component={SettingsBilling} /> },
              {
                path: "notifications",
                element: <Page component={SettingsNotifications} />,
              },
              { path: "privacy", element: <Page component={SettingsPrivacy} /> },
              { path: "security", element: <Page component={SettingsSecurity} /> },
              {
                path: "security-config",
                element: <Navigate to="/app/admin/security-config" replace />,
              },
              {
                path: "integrations",
                element: <Page component={SettingsIntegrations} />,
              },
              {
                path: "byok",
                element: <Navigate to="/app/settings/models" replace />,
              },
              {
                path: "appearance",
                element: <Page component={SettingsAppearance} />,
              },
              {
                path: "subscription",
                element: <Navigate to="/app/settings/billing" replace />,
              },
              {
                path: "credits",
                element: <Navigate to="/app/settings/billing" replace />,
              },
              { path: "data", element: <Page component={SettingsData} /> },
              { path: "danger", element: <Page component={SettingsDanger} /> },
              { path: "hotkeys", element: <Page component={SettingsHotkeys} /> },
              { path: "polish", element: <Page component={SettingsPolish} /> },
            ],
          },

          { path: "*", element: <Page component={NotFound} /> },
        ],
      },

      // Admin portal — standalone shell (no user AppShell chrome)
      {
        path: "admin",
        element: (
          <ProtectedRoute requireAdmin>
            <Suspense fallback={<PageLoader />}>
              <AdminLayout />
            </Suspense>
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <Page component={AdminDashboard} /> },
          { path: "users", element: <Page component={AdminUsers} /> },
          { path: "analytics", element: <Page component={AdminAnalytics} /> },
          { path: "revenue", element: <Page component={AdminRevenue} /> },
          {
            path: "model-costs",
            element: <Page component={AdminModelCosts} />,
          },
          {
            path: "ai-hub",
            element: <Page component={AdminAiHub} />,
          },
          {
            path: "feature-flags",
            element: <Page component={AdminFeatureFlags} />,
          },
          {
            path: "seed-questions",
            element: <Page component={AdminSeedQuestions} />,
          },
          {
            path: "bulk-upload",
            element: <Page component={AdminBulkUpload} />,
          },
          { path: "live-chat", element: <Page component={AdminLiveChat} /> },
          {
            path: "questions",
            element: <Page component={AdminQuestionEditor} />,
          },
          {
            path: "questions/:id",
            element: <Page component={AdminQuestionEditor} />,
          },
          { path: "audit-log", element: <Page component={AdminAuditLog} /> },
          { path: "qa-checklist", element: <Page component={AdminQAChecklist} /> },
          { path: "support",   element: <Page component={AdminSupport} /> },
          { path: "promo-codes", element: <Page component={AdminPromoCodes} /> },
          { path: "billing-settings", element: <Page component={AdminBillingSettings} /> },
          { path: "gov/sources", element: <Page component={AdminGovSources} /> },
          { path: "gov/ingest", element: <Page component={AdminGovIngest} /> },
          { path: "gov/exams", element: <Page component={AdminGovExamRegistry} /> },
          {
            path: "gov/question-review",
            element: <Page component={AdminGovQuestionReview} />,
          },
          {
            path: "gov/paper-review",
            element: <Page component={AdminGovPaperReview} />,
          },
          {
            path: "gov/translations",
            element: <Page component={AdminGovTranslationReview} />,
          },
          { path: "community", element: <Page component={AdminCommunity} /> },
          { path: "learning", element: <Page component={AdminLearning} /> },
          {
            path: "security-config",
            element: <Page component={SettingsSecurityConfig} />,
          },
        ],
      },
    ],
  },


  { path: "*", element: <Page component={NotFound} /> },
    ],
  },
];

const router = IS_ELECTRON
  ? createHashRouter(routes)
  : createBrowserRouter(routes);

// ─────────────────────────────────────────────────────────────────────────────
// Root App
// ─────────────────────────────────────────────────────────────────────────────

export default function App(): JSX.Element {
  const initialize = useAuthStore((state) => state.initialize);
  const profile = useAuthStore((state) => state.profile);
  const resolveFeatureFlags = useGlobalStore((state) => state.resolveFeatureFlags);

  const theme = useUIStore((state) => state.theme);
  const resolvedTheme = useUIStore((state) => state.resolved_theme);
  const stealthMode = useUIStore((state) => state.stealth_mode);

  useFocusRecoveryCoordinator();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (profile?.plan_id) {
      resolveFeatureFlags(profile.plan_id as PlanId);
    }
  }, [profile?.plan_id, resolveFeatureFlags]);

  useEffect(() => {
    const applyThemePrefs = () => {
      const { accentColor, fontSize, density } = useThemeStore.getState();
      applyAppearancePreferences({ accentColor, fontSize, density });
    };

    applyThemePrefs();
    return useThemeStore.subscribe(applyThemePrefs);
  }, []);

  useEffect(() => {
    useUIStore.getState().setTheme(useUIStore.getState().theme);

    if (theme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      useUIStore.getState().setTheme("system");
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [theme]);

  useEffect(() => {
    syncStealthFromOverlay();
  }, []);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const api = electronWindow.electronAPI;
    if (!api?.onGlobalShortcut) return;

    void import("@/lib/overlay/hotkeyOverrides").then((m) => {
      void api.syncGlobalShortcuts?.(m.buildElectronShortcutBindings());
    });

    api.onGlobalShortcut((action: string) => {
      if (action === "toggle-overlay") {
        useOverlayStore.getState().toggleMinimize();
        return;
      }
      if (action === "panic-calm") {
        useOverlayStore.getState().showPanic(PANIC_RESPONSE);
        return;
      }
      if (action === "request-ai-answer") {
        window.dispatchEvent(new CustomEvent("clarify:global-shortcut", { detail: { action } }));
      }
    });

    api.onHotkeyConflict?.((info) => {
      toast.warning(`Hotkey ${info.key} could not be registered — may conflict with another app.`);
    });

    return () => {
      api.removeGlobalShortcutListener?.();
      api.removeHotkeyConflictListener?.();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    root.classList.toggle("dark", resolvedTheme === "dark");
    root.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const root = document.documentElement;

    root.setAttribute("data-stealth", stealthMode ? "true" : "false");
  }, [stealthMode]);

  return (
    <GlobalErrorBoundary>
      <ErrorBoundary>
        <RouterProvider router={router} />

        <Toaster
          position="bottom-right"
          expand={false}
          richColors
          closeButton
          visibleToasts={5}
          toastOptions={{
            duration: 4000,
            classNames: {
              toast: "font-sans text-sm",
            },
          }}
        />

        <TabAudioGuideHost />
        {IS_ELECTRON && <ElectronFirstRunModal />}
      </ErrorBoundary>
    </GlobalErrorBoundary>
  );
}
