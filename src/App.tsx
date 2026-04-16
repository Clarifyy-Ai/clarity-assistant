import { lazy, Suspense, useEffect, memo } from "react";
import { cn } from "@/lib/utils";
import {
  createBrowserRouter,
  createHashRouter,
  RouterProvider,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { useOverlayStore } from "@/store/overlayStore";
import { syncStealthFromOverlay } from "@/lib/stealth/stealthActions";

import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { MobileNav } from "@/components/layout/MobileNav";
import { NetworkBanner } from "@/components/layout/NetworkBanner";
import { SetupChecklist } from "@/components/layout/SetupChecklist";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { CookieConsent } from "@/components/common/CookieConsent";

// ★ Detect Electron at module level — used for router + IPC decisions
const IS_ELECTRON = !!(window as any).electronAPI?.isElectron;

// ─────────────────────────────────────────────────────────────────────────────
// Lazy page imports
// ─────────────────────────────────────────────────────────────────────────────

// Auth
const Login          = lazy(() => import("@/pages/auth/Login"));
const Signup         = lazy(() => import("@/pages/auth/Signup"));
const VerifyEmail    = lazy(() => import("@/pages/auth/VerifyEmail"));
const ResetPassword  = lazy(() => import("@/pages/auth/ResetPassword"));
const AuthCallback   = lazy(() => import("@/pages/auth/AuthCallback"));

// Onboarding
const OnboardingIndex = lazy(() => import("@/pages/onboarding/OnboardingIndex"));

// App — top-level
const Dashboard      = lazy(() => import("@/pages/app/Dashboard"));
const Analytics      = lazy(() => import("@/pages/app/Analytics"));
const InterviewDay   = lazy(() => import("@/pages/app/InterviewDay"));
const Profile        = lazy(() => import("@/pages/app/Profile"));
const Notifications  = lazy(() => import("@/pages/app/Notifications"));
const Referrals      = lazy(() => import("@/pages/app/Referrals"));

// Live
const LiveRehearsal  = lazy(() => import("@/pages/app/live/LiveRehearsal"));
const LiveOverlay    = lazy(() => import("@/pages/app/live/LiveOverlay"));

// Mock
const MockInterview  = lazy(() => import("@/pages/app/mock/MockInterview"));
const MockSession    = lazy(() => import("@/pages/app/mock/MockSession"));
const MockWarmup     = lazy(() => import("@/pages/app/mock/MockWarmup"));

// Mock Test Engine
const MockTestHub      = lazy(() => import("@/pages/app/mock-test/MockTestHub"));
const MyQuestions      = lazy(() => import("@/pages/app/mock-test/MyQuestions"));
const UploadQuestions  = lazy(() => import("@/pages/app/mock-test/UploadQuestions"));
const TestConfigure    = lazy(() => import("@/pages/app/mock-test/TestConfigure"));
const TestSession      = lazy(() => import("@/pages/app/mock-test/TestSession"));
const TestResults      = lazy(() => import("@/pages/app/mock-test/TestResults"));
const TestRevision     = lazy(() => import("@/pages/app/mock-test/TestRevision"));
const TestAnalytics    = lazy(() => import("@/pages/app/mock-test/TestAnalytics"));
const ExamPapers       = lazy(() => import("@/pages/app/mock-test/ExamPapers"));

// Prep
const PrepLab          = lazy(() => import("@/pages/app/prep/PrepLab"));
const StarBuilder      = lazy(() => import("@/pages/app/prep/StarBuilder"));
const ProjectBuilder   = lazy(() => import("@/pages/app/prep/ProjectBuilder"));
const Rephraser        = lazy(() => import("@/pages/app/prep/Rephraser"));
const CodingHints      = lazy(() => import("@/pages/app/prep/CodingHints"));
const SystemDesign     = lazy(() => import("@/pages/app/prep/SystemDesign"));

// Sessions
const SessionHistory   = lazy(() => import("@/pages/app/sessions/SessionHistory"));
const CallSessions     = lazy(() => import("@/pages/app/sessions/CallSessions"));
const SessionDetail    = lazy(() => import("@/pages/app/sessions/SessionDetail"));

// Documents
const Documents        = lazy(() => import("@/pages/app/documents/Documents"));
const ResumeDetail     = lazy(() => import("@/pages/app/documents/ResumeDetail"));
const JDDetail         = lazy(() => import("@/pages/app/documents/JDDetail"));

// Answer Bank
const AnswerBank       = lazy(() => import("@/pages/app/answer-bank/AnswerBank"));
const AnswerDetail     = lazy(() => import("@/pages/app/answer-bank/AnswerDetail"));

// Interviews
const Interviews       = lazy(() => import("@/pages/app/interviews/Interviews"));
const NewInterview     = lazy(() => import("@/pages/app/interviews/NewInterview"));
const InterviewDetail  = lazy(() => import("@/pages/app/interviews/InterviewDetail"));

// Company Research
const CompanyResearch  = lazy(() => import("@/pages/app/company-research/CompanyResearch"));
const CompanyProfile   = lazy(() => import("@/pages/app/company-research/CompanyProfile"));

// Debrief
const Debrief          = lazy(() => import("@/pages/app/debrief/Debrief"));
const DebriefDetail    = lazy(() => import("@/pages/app/debrief/DebriefDetail"));

// Rooms
const PracticeRooms    = lazy(() => import("@/pages/app/rooms/PracticeRooms"));
const NewRoom          = lazy(() => import("@/pages/app/rooms/NewRoom"));
const RoomSession      = lazy(() => import("@/pages/app/rooms/RoomSession"));

// Settings
const Settings              = lazy(() => import("@/pages/app/settings/Settings"));
const SettingsProfile       = lazy(() => import("@/pages/app/settings/SettingsProfile"));
const SettingsAudio         = lazy(() => import("@/pages/app/settings/SettingsAudio"));
const SettingsModels        = lazy(() => import("@/pages/app/settings/SettingsModels"));
const SettingsBilling       = lazy(() => import("@/pages/app/settings/SettingsBilling"));
const SettingsNotifications = lazy(() => import("@/pages/app/settings/SettingsNotifications"));
const SettingsPrivacy       = lazy(() => import("@/pages/app/settings/SettingsPrivacy"));
const SettingsSecurity      = lazy(() => import("@/pages/app/settings/SettingsSecurity"));
const SettingsIntegrations  = lazy(() => import("@/pages/app/settings/SettingsIntegrations"));
const SettingsBYOK          = lazy(() => import("@/pages/app/settings/SettingsBYOK"));
const SettingsAppearance    = lazy(() => import("@/pages/app/settings/SettingsAppearance"));
const SettingsSubscription  = lazy(() => import("@/pages/app/settings/SettingsSubscription"));
const SettingsCredits       = lazy(() => import("@/pages/app/settings/SettingsCredits"));
const SettingsData          = lazy(() => import("@/pages/app/settings/SettingsData"));
const SettingsDanger        = lazy(() => import("@/pages/app/settings/SettingsDanger"));

// Marketing
const Landing      = lazy(() => import("@/pages/marketing/Landing"));
const Pricing      = lazy(() => import("@/pages/marketing/Pricing"));
const Help         = lazy(() => import("@/pages/marketing/Help"));
const HelpArticle  = lazy(() => import("@/pages/marketing/HelpArticle"));
const Shortcuts    = lazy(() => import("@/pages/marketing/Shortcuts"));
const Blog         = lazy(() => import("@/pages/marketing/Blog"));
const BlogPost     = lazy(() => import("@/pages/marketing/BlogPost"));
const Terms        = lazy(() => import("@/pages/marketing/Terms"));
const Privacy      = lazy(() => import("@/pages/marketing/Privacy"));

// Guide / Admin / Scorecard / 404
const Guide             = lazy(() => import("@/pages/app/guide/Guide"));
const AdminDashboard    = lazy(() => import("@/pages/app/admin/AdminDashboard"));
const AdminUsers        = lazy(() => import("@/pages/app/admin/AdminUsers"));
const AdminAnalytics    = lazy(() => import("@/pages/app/admin/AdminAnalytics"));
const AdminRevenue      = lazy(() => import("@/pages/app/admin/AdminRevenue"));
const AdminModelCosts   = lazy(() => import("@/pages/app/admin/AdminModelCosts"));
const AdminFeatureFlags = lazy(() => import("@/pages/app/admin/AdminFeatureFlags"));
const AdminSeedQuestions = lazy(() => import("@/pages/app/admin/AdminSeedQuestions"));
const AdminLayout       = lazy(() => import("@/pages/app/admin/AdminLayout"));
const Scorecard         = lazy(() => import("@/pages/Scorecard"));
const NotFound          = lazy(() => import("@/pages/NotFound"));

// ─────────────────────────────────────────────────────────────────────────────
// Loaders
// ─────────────────────────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function Page({ component: Component }: { component: React.ComponentType }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QueryClient
// ─────────────────────────────────────────────────────────────────────────────

function OnboardingRedirect() {
  const location = useLocation();
  return <Navigate to={`/onboarding${location.search}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          1000 * 60 * 2,
      gcTime:             1000 * 60 * 10,
      retry: (failureCount, error: unknown) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof (error as { status: number }).status === "number" &&
          (error as { status: number }).status < 500
        ) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// App shell
// ─────────────────────────────────────────────────────────────────────────────

function AppShell() {
  const profile          = useAuthStore((s) => s.profile);
  const location         = useLocation();
  const mobileNavOpen    = useUIStore((s) => s.mobile_nav_open);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);

  const showSetupChecklist =
    profile &&
    !profile.onboarding_completed &&
    !location.pathname.startsWith("/app/dashboard");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        useUIStore.getState().toggleSidebar();
      }
      // ★ Electron: hide overlay with Escape
      if (IS_ELECTRON && e.key === "Escape") {
        (window as any).electronAPI?.hide();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    // ★ FIX: h-[100vh] instead of h-screen — more reliable in Electron
    <div className={cn(
      "flex h-[100vh] w-full overflow-hidden",
      IS_ELECTRON ? "electron-shell" : "bg-background"
    )}>

      {/* ★ FIX: drag region for frameless Electron window — only shown in Electron */}
      {IS_ELECTRON && (
        <div
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          className="fixed top-0 left-0 right-0 h-8 z-[9999] pointer-events-none"
        />
      )}

      {/* Mobile sidebar drawer */}
      {mobileNavOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <AppSidebar onNavClick={() => setMobileNavOpen(false)} />
          </div>
        </>
      )}

      <AppSidebar />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <AppTopBar />
        <NetworkBanner />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
            {showSetupChecklist && (
              <div className="mb-6">
                <SetupChecklist />
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNav />
      <UpgradeModal />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppress React Router v6→v7 future-flag warning
// ─────────────────────────────────────────────────────────────────────────────
{
  const _w = console.warn.bind(console);
  console.warn = (...a: unknown[]) => {
    if (typeof a[0] === "string" && a[0].includes("React Router Future Flag Warning")) return;
    _w(...a);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route definitions — shared between both router types
// ─────────────────────────────────────────────────────────────────────────────

const routes = [
  // Marketing
  { path: "/",           element: <Page component={Landing} /> },
  { path: "/pricing",    element: <Page component={Pricing} /> },
  { path: "/help",       element: <Page component={Help} /> },
  { path: "/help/:slug", element: <Page component={HelpArticle} /> },
  { path: "/shortcuts",  element: <Page component={Shortcuts} /> },
  { path: "/blog",       element: <Page component={Blog} /> },
  { path: "/blog/:slug", element: <Page component={BlogPost} /> },
  { path: "/terms",      element: <Page component={Terms} /> },
  { path: "/privacy",    element: <Page component={Privacy} /> },

  { path: "/dashboard",  element: <Navigate to="/app/dashboard" replace /> },

  // Auth
  { path: "/login",           element: <Page component={Login} /> },
  { path: "/signup",          element: <Page component={Signup} /> },
  { path: "/verify-email",    element: <Page component={VerifyEmail} /> },
  { path: "/forgot-password", element: <Page component={ResetPassword} /> },
  { path: "/reset-password",  element: <Page component={ResetPassword} /> },
  { path: "/auth/callback",   element: <Page component={AuthCallback} /> },

  // Onboarding
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/onboarding",        element: <Page component={OnboardingIndex} /> },
      { path: "/onboarding/step-1", element: <OnboardingRedirect /> },
      { path: "/onboarding/step-2", element: <OnboardingRedirect /> },
      { path: "/onboarding/step-3", element: <OnboardingRedirect /> },
      { path: "/onboarding/step-4", element: <OnboardingRedirect /> },
      { path: "/onboarding/step-5", element: <OnboardingRedirect /> },
    ],
  },

  // Full-screen protected (no shell)
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/app/live/overlay",              element: <Page component={LiveOverlay} /> },
      { path: "/app/rooms/:roomId/session",     element: <Page component={RoomSession} /> },
      { path: "/app/mock-test/session/:testId", element: <Page component={TestSession} /> },
    ],
  },

  // Main app shell
  {
    path: "/app",
    element: <ProtectedRoute requireOnboarded />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },

          { path: "dashboard",     element: <Page component={Dashboard} /> },
          { path: "interview-day", element: <Page component={InterviewDay} /> },
          { path: "analytics",     element: <Page component={Analytics} /> },
          { path: "profile",       element: <Page component={Profile} /> },
          { path: "notifications", element: <Page component={Notifications} /> },
          { path: "referrals",     element: <Page component={Referrals} /> },
          { path: "live",          element: <Page component={LiveRehearsal} /> },

          { path: "mock",          element: <Page component={MockInterview} /> },
          { path: "mock/warmup",   element: <Page component={MockWarmup} /> },
          { path: "mock/session",  element: <Page component={MockSession} /> },

          { path: "mock-test",                    element: <Page component={MockTestHub} /> },
          { path: "mock-test/configure",          element: <Page component={TestConfigure} /> },
          { path: "mock-test/results/:testId",    element: <Page component={TestResults} /> },
          { path: "mock-test/my-questions",       element: <Page component={MyQuestions} /> },
          { path: "mock-test/upload",             element: <Page component={UploadQuestions} /> },
          { path: "mock-test/revision",           element: <Page component={TestRevision} /> },
          { path: "mock-test/analytics",          element: <Page component={TestAnalytics} /> },
          { path: "mock-test/papers/:examType",   element: <Page component={ExamPapers} /> },

          { path: "prep",                  element: <Page component={PrepLab} /> },
          { path: "prep/star-builder",     element: <Page component={StarBuilder} /> },
          { path: "prep/project-builder",  element: <Page component={ProjectBuilder} /> },
          { path: "prep/rephraser",        element: <Page component={Rephraser} /> },
          { path: "prep/coding-hints",     element: <Page component={CodingHints} /> },
          { path: "prep/system-design",    element: <Page component={SystemDesign} /> },

          { path: "sessions",        element: <Page component={CallSessions} /> },
          { path: "sessions/history", element: <Page component={SessionHistory} /> },
          { path: "sessions/:id",     element: <Page component={SessionDetail} /> },

          { path: "documents",            element: <Page component={Documents} /> },
          { path: "documents/resume/:id", element: <Page component={ResumeDetail} /> },
          { path: "documents/jd/:id",     element: <Page component={JDDetail} /> },

          { path: "answers",    element: <Page component={AnswerBank} /> },
          { path: "answers/:id",element: <Page component={AnswerDetail} /> },

          { path: "interviews",     element: <Page component={Interviews} /> },
          { path: "interviews/new", element: <Page component={NewInterview} /> },
          { path: "interviews/:id", element: <Page component={InterviewDetail} /> },

          { path: "companies",    element: <Page component={CompanyResearch} /> },
          { path: "companies/:id",element: <Page component={CompanyProfile} /> },

          { path: "scorecard/:sessionId", element: <Page component={Scorecard} /> },

          { path: "debrief",    element: <Page component={Debrief} /> },
          { path: "debrief/:id",element: <Page component={DebriefDetail} /> },

          { path: "guide",     element: <Page component={Guide} /> },
          { path: "rooms",     element: <Page component={PracticeRooms} /> },
          { path: "rooms/new", element: <Page component={NewRoom} /> },

          {
            path: "settings",
            element: <Page component={Settings} />,
            children: [
              { index: true,          element: <Navigate to="profile" replace /> },
              { path: "profile",      element: <Page component={SettingsProfile} /> },
              { path: "audio",        element: <Page component={SettingsAudio} /> },
              { path: "models",       element: <Page component={SettingsModels} /> },
              { path: "billing",      element: <Page component={SettingsBilling} /> },
              { path: "notifications",element: <Page component={SettingsNotifications} /> },
              { path: "privacy",      element: <Page component={SettingsPrivacy} /> },
              { path: "security",     element: <Page component={SettingsSecurity} /> },
              { path: "integrations", element: <Page component={SettingsIntegrations} /> },
              { path: "byok",         element: <Page component={SettingsBYOK} /> },
              { path: "appearance",   element: <Page component={SettingsAppearance} /> },
              { path: "subscription", element: <Page component={SettingsSubscription} /> },
              { path: "credits",      element: <Page component={SettingsCredits} /> },
              { path: "data",         element: <Page component={SettingsData} /> },
              { path: "danger",       element: <Page component={SettingsDanger} /> },
            ],
          },

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
              { index: true,          element: <Page component={AdminDashboard} /> },
              { path: "users",         element: <Page component={AdminUsers} /> },
              { path: "analytics",     element: <Page component={AdminAnalytics} /> },
              { path: "revenue",       element: <Page component={AdminRevenue} /> },
              { path: "model-costs",   element: <Page component={AdminModelCosts} /> },
              { path: "feature-flags", element: <Page component={AdminFeatureFlags} /> },
              { path: "seed-questions", element: <Page component={AdminSeedQuestions} /> },
            ],
          },
        ],
      },
    ],
  },

  { path: "*", element: <Page component={NotFound} /> },
];

// ★ FIX: createHashRouter for Electron (file://), createBrowserRouter for web
const router = IS_ELECTRON
  ? createHashRouter(routes)
  : createBrowserRouter(routes);

// ─────────────────────────────────────────────────────────────────────────────
// Root App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const initialize   = useAuthStore((s) => s.initialize);
  const theme        = useUIStore((s) => s.theme);
  const resolvedTheme = useUIStore((s) => s.resolved_theme);
  const stealthMode  = useUIStore((s) => s.stealth_mode);

  useEffect(() => { initialize(); }, []); // eslint-disable-line

  // FIX Issue 15: refresh JWT when tab becomes visible after being backgrounded
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    useUIStore.getState().setTheme(useUIStore.getState().theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => useUIStore.getState().setTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    syncStealthFromOverlay();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-stealth", stealthMode ? "true" : "false");

    // ★ FIX: sync stealth mode with Electron content protection
    if (IS_ELECTRON) {
      // Stealth ON = hide from screen share (already on by default via setContentProtection)
      // If user disables stealth — keep protection on regardless for security
      (window as any).electronAPI?.setAlwaysOnTop(!stealthMode ? false : true);
    }
  }, [stealthMode]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster
          position="bottom-right"
          expand={false}
          richColors
          closeButton
          toastOptions={{
            duration: 4000,
            classNames: { toast: "font-sans text-sm" },
          }}
        />
        <CookieConsent />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
