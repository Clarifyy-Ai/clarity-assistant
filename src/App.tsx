import { lazy, Suspense, useEffect } from "react";
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";

import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { MobileNav } from "@/components/layout/MobileNav";
import { NetworkBanner } from "@/components/layout/NetworkBanner";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Lazy page imports — each route chunk loaded on demand
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
const Dashboard     = lazy(() => import("@/pages/app/Dashboard"));
const Analytics     = lazy(() => import("@/pages/app/Analytics"));
const InterviewDay  = lazy(() => import("@/pages/app/InterviewDay"));
const Profile       = lazy(() => import("@/pages/app/Profile"));
const Notifications = lazy(() => import("@/pages/app/Notifications"));
const Referrals     = lazy(() => import("@/pages/app/Referrals"));

// Live
const LiveRehearsal = lazy(() => import("@/pages/app/live/LiveRehearsal"));
const LiveOverlay   = lazy(() => import("@/pages/app/live/LiveOverlay"));

// Mock
const MockInterview = lazy(() => import("@/pages/app/mock/MockInterview"));
const MockSession   = lazy(() => import("@/pages/app/mock/MockSession"));
const MockWarmup    = lazy(() => import("@/pages/app/mock/MockWarmup"));

// Prep
const PrepLab       = lazy(() => import("@/pages/app/prep/PrepLab"));
const StarBuilder   = lazy(() => import("@/pages/app/prep/StarBuilder"));
const ProjectBuilder = lazy(() => import("@/pages/app/prep/ProjectBuilder"));
const Rephraser     = lazy(() => import("@/pages/app/prep/Rephraser"));
const CodingHints   = lazy(() => import("@/pages/app/prep/CodingHints"));
const SystemDesign  = lazy(() => import("@/pages/app/prep/SystemDesign"));

// Sessions
const SessionHistory = lazy(() => import("@/pages/app/sessions/SessionHistory"));
const SessionDetail  = lazy(() => import("@/pages/app/sessions/SessionDetail"));

// Documents
const Documents    = lazy(() => import("@/pages/app/documents/Documents"));
const ResumeDetail = lazy(() => import("@/pages/app/documents/ResumeDetail"));
const JDDetail     = lazy(() => import("@/pages/app/documents/JDDetail"));

// Answer Bank
const AnswerBank   = lazy(() => import("@/pages/app/answer-bank/AnswerBank"));
const AnswerDetail = lazy(() => import("@/pages/app/answer-bank/AnswerDetail"));

// Interviews
const Interviews       = lazy(() => import("@/pages/app/interviews/Interviews"));
const NewInterview     = lazy(() => import("@/pages/app/interviews/NewInterview"));
const InterviewDetail  = lazy(() => import("@/pages/app/interviews/InterviewDetail"));

// Company Research
const CompanyResearch = lazy(() => import("@/pages/app/company-research/CompanyResearch"));
const CompanyProfile  = lazy(() => import("@/pages/app/company-research/CompanyProfile"));

// Debrief
const Debrief       = lazy(() => import("@/pages/app/debrief/Debrief"));
const DebriefDetail = lazy(() => import("@/pages/app/debrief/DebriefDetail"));

// Rooms
const PracticeRooms = lazy(() => import("@/pages/app/rooms/PracticeRooms"));
const NewRoom       = lazy(() => import("@/pages/app/rooms/NewRoom"));
const RoomSession   = lazy(() => import("@/pages/app/rooms/RoomSession"));

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
const Landing     = lazy(() => import("@/pages/marketing/Landing"));
const Pricing     = lazy(() => import("@/pages/marketing/Pricing"));
const Help        = lazy(() => import("@/pages/marketing/Help"));
const HelpArticle = lazy(() => import("@/pages/marketing/HelpArticle"));
const Shortcuts   = lazy(() => import("@/pages/marketing/Shortcuts"));
const Blog        = lazy(() => import("@/pages/marketing/Blog"));
const BlogPost    = lazy(() => import("@/pages/marketing/BlogPost"));

// Admin
const AdminDashboard    = lazy(() => import("@/pages/app/admin/AdminDashboard"));
const AdminUsers        = lazy(() => import("@/pages/app/admin/AdminUsers"));
const AdminAnalytics    = lazy(() => import("@/pages/app/admin/AdminAnalytics"));
const AdminFlags        = lazy(() => import("@/pages/app/admin/AdminFlags"));
const AdminRevenue      = lazy(() => import("@/pages/app/admin/AdminRevenue"));
const AdminModelCosts   = lazy(() => import("@/pages/app/admin/AdminModelCosts"));
const AdminFeatureFlags = lazy(() => import("@/pages/app/admin/AdminFeatureFlags"));
const AdminLayout       = lazy(() => import("@/pages/app/admin/AdminLayout"));

// Scorecard
const Scorecard = lazy(() => import("@/pages/Scorecard"));

// 404
const NotFound = lazy(() => import("@/pages/NotFound"));

// ─────────────────────────────────────────────────────────────────────────────
// Page loader fallback — lightweight spinner shown between route transitions
// ─────────────────────────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

/** Wrap every lazy page so Suspense is never forgotten */
function Page({ component: Component }: { component: React.ComponentType }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// React Query client
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 10,
      retry: (failureCount, error: unknown) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof (error as { status: number }).status === "number" &&
          (error as { status: number }).status < 500
        ) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// App shell layout
// ─────────────────────────────────────────────────────────────────────────────

function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopBar />
        <NetworkBanner />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Suppress the React Router v6→v7 future-flag deprecation warning.
// createBrowserRouter emits it at call time, so the suppressor must be
// installed here (in the same module, before the call) not in main.tsx.
// ─────────────────────────────────────────────────────────────────────────────
{
  const _w = console.warn.bind(console);
  console.warn = (...a: unknown[]) => {
    if (typeof a[0] === "string" && a[0].includes("React Router Future Flag Warning")) return;
    _w(...a);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const router = createBrowserRouter([
  // ── Marketing ──────────────────────────────────────────────────────────────
  { path: "/",          element: <Page component={Landing} /> },
  { path: "/pricing",   element: <Page component={Pricing} /> },
  { path: "/help",      element: <Page component={Help} /> },
  { path: "/help/:slug",element: <Page component={HelpArticle} /> },
  { path: "/shortcuts", element: <Page component={Shortcuts} /> },
  { path: "/blog",      element: <Page component={Blog} /> },
  { path: "/blog/:slug",element: <Page component={BlogPost} /> },

  // ── Auth ───────────────────────────────────────────────────────────────────
  { path: "/login",          element: <Page component={Login} /> },
  { path: "/signup",         element: <Page component={Signup} /> },
  { path: "/verify-email",   element: <Page component={VerifyEmail} /> },
  { path: "/forgot-password",element: <Page component={ResetPassword} /> },
  { path: "/reset-password", element: <Page component={ResetPassword} /> },
  { path: "/auth/callback",  element: <Page component={AuthCallback} /> },

  // ── Onboarding (protected, no shell) ───────────────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/onboarding",        element: <Page component={OnboardingIndex} /> },
      { path: "/onboarding/step-1", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-2", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-3", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-4", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-5", element: <Navigate to="/onboarding" replace /> },
    ],
  },

  // ── Full-screen protected routes (no app shell) ────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/app/live/overlay",            element: <Page component={LiveOverlay} /> },
      { path: "/app/rooms/:roomId/session",   element: <Page component={RoomSession} /> },
    ],
  },

  // ── Main app (protected + onboarded + shell) ───────────────────────────────
  {
    path: "/app",
    element: <ProtectedRoute requireOnboarded />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },

          { path: "dashboard",    element: <Page component={Dashboard} /> },
          { path: "interview-day",element: <Page component={InterviewDay} /> },
          { path: "analytics",    element: <Page component={Analytics} /> },
          { path: "profile",      element: <Page component={Profile} /> },
          { path: "notifications",element: <Page component={Notifications} /> },
          { path: "referrals",    element: <Page component={Referrals} /> },

          { path: "live", element: <Page component={LiveRehearsal} /> },

          { path: "mock",         element: <Page component={MockInterview} /> },
          { path: "mock/warmup",  element: <Page component={MockWarmup} /> },
          { path: "mock/session", element: <Page component={MockSession} /> },

          { path: "prep",                element: <Page component={PrepLab} /> },
          { path: "prep/star-builder",   element: <Page component={StarBuilder} /> },
          { path: "prep/project-builder",element: <Page component={ProjectBuilder} /> },
          { path: "prep/rephraser",      element: <Page component={Rephraser} /> },
          { path: "prep/coding-hints",   element: <Page component={CodingHints} /> },
          { path: "prep/system-design",  element: <Page component={SystemDesign} /> },

          { path: "sessions",    element: <Page component={SessionHistory} /> },
          { path: "sessions/:id",element: <Page component={SessionDetail} /> },

          { path: "documents",               element: <Page component={Documents} /> },
          { path: "documents/resume/:id",    element: <Page component={ResumeDetail} /> },
          { path: "documents/jd/:id",        element: <Page component={JDDetail} /> },

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

          { path: "rooms",    element: <Page component={PracticeRooms} /> },
          { path: "rooms/new",element: <Page component={NewRoom} /> },

          {
            path: "settings",
            element: <Page component={Settings} />,
            children: [
              { index: true, element: <Navigate to="profile" replace /> },
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
              { path: "flags",         element: <Page component={AdminFlags} /> },
              { path: "revenue",       element: <Page component={AdminRevenue} /> },
              { path: "model-costs",   element: <Page component={AdminModelCosts} /> },
              { path: "feature-flags", element: <Page component={AdminFeatureFlags} /> },
            ],
          },
        ],
      },
    ],
  },

  { path: "*", element: <Page component={NotFound} /> },
], { future: { v7_startTransition: true } as any });

// ─────────────────────────────────────────────────────────────────────────────
// Root App component
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const theme = useUIStore((s) => s.theme);

  // Single initialize() call — authStore owns ALL auth logic
  useEffect(() => {
    initialize();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme sync → <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("data-theme", theme);
    localStorage.setItem("clarity-theme", theme);
  }, [theme]);

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
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
