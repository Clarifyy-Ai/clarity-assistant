// ─────────────────────────────────────────────────────────────────────────────
// App.tsx — Root application component.
// Owns the Supabase auth listener, theme sync, React Query client,
// and the createBrowserRouter route tree.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect }       from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
}                          from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import posthog             from "posthog-js";

// ── Stores ────────────────────────────────────────────────────────────────────
// ✅ FIXED: was "@/store/userStore" — now points to the new authStore
import { useAuthStore }    from "@/store/authStore";
import { useUIStore }      from "@/store/uiStore";

// ── Supabase ──────────────────────────────────────────────────────────────────
import { supabase }        from "@/lib/supabase/client";

// ── Layout components ─────────────────────────────────────────────────────────
import { ProtectedRoute }  from "@/components/layout/ProtectedRoute";
import { AppSidebar }      from "@/components/layout/AppSidebar";
import { AppTopBar }       from "@/components/layout/AppTopBar";
import { MobileNav }       from "@/components/layout/MobileNav";
import { NetworkBanner }   from "@/components/layout/NetworkBanner";
import { ErrorBoundary }   from "@/components/layout/ErrorBoundary";
import { Toaster }         from "@/components/ui/sonner";          // ✅ NEW: our wrapped sonner

// ── Pages: Auth ───────────────────────────────────────────────────────────────
import Login               from "@/pages/auth/Login";
import Signup              from "@/pages/auth/Signup";
import VerifyEmail         from "@/pages/auth/VerifyEmail";
import ResetPassword       from "@/pages/auth/ResetPassword";       // ✅ NEW

// ── Pages: Onboarding ─────────────────────────────────────────────────────────
// ✅ CHANGED: use the orchestrator instead of wiring each step manually
import OnboardingIndex     from "@/pages/onboarding/OnboardingIndex";

// ── Pages: App Core ───────────────────────────────────────────────────────────
import Dashboard           from "@/pages/app/Dashboard";
import Analytics           from "@/pages/app/Analytics";
import InterviewDay        from "@/pages/app/InterviewDay";
import Profile             from "@/pages/app/Profile";
import Notifications       from "@/pages/app/Notifications";
import Referrals           from "@/pages/app/Referrals";

// ── Pages: Live ───────────────────────────────────────────────────────────────
import LiveRehearsal       from "@/pages/app/live/LiveRehearsal";
import LiveOverlay         from "@/pages/app/live/LiveOverlay";

// ── Pages: Mock ───────────────────────────────────────────────────────────────
import MockInterview       from "@/pages/app/mock/MockInterview";
import MockSession         from "@/pages/app/mock/MockSession";
import MockWarmup          from "@/pages/app/mock/MockWarmup";

// ── Pages: Prep Lab ───────────────────────────────────────────────────────────
import PrepLab             from "@/pages/app/prep/PrepLab";
import StarBuilder         from "@/pages/app/prep/StarBuilder";
import ProjectBuilder      from "@/pages/app/prep/ProjectBuilder";
import Rephraser           from "@/pages/app/prep/Rephraser";
import CodingHints         from "@/pages/app/prep/CodingHints";
import SystemDesign        from "@/pages/app/prep/SystemDesign";

// ── Pages: Sessions ───────────────────────────────────────────────────────────
import SessionHistory      from "@/pages/app/sessions/SessionHistory";
import SessionDetail       from "@/pages/app/sessions/SessionDetail";

// ── Pages: Documents ──────────────────────────────────────────────────────────
import Documents           from "@/pages/app/documents/Documents";
import ResumeDetail        from "@/pages/app/documents/ResumeDetail";
import JDDetail            from "@/pages/app/documents/JDDetail";

// ── Pages: Answer Bank ────────────────────────────────────────────────────────
import AnswerBank          from "@/pages/app/answer-bank/AnswerBank";
import AnswerDetail        from "@/pages/app/answer-bank/AnswerDetail";

// ── Pages: Interviews ─────────────────────────────────────────────────────────
import Interviews          from "@/pages/app/interviews/Interviews";
import NewInterview        from "@/pages/app/interviews/NewInterview";
import InterviewDetail     from "@/pages/app/interviews/InterviewDetail";

// ── Pages: Company Research ───────────────────────────────────────────────────
import CompanyResearch     from "@/pages/app/company-research/CompanyResearch";
import CompanyProfile      from "@/pages/app/company-research/CompanyProfile";

// ── Pages: Debrief ────────────────────────────────────────────────────────────
import Debrief             from "@/pages/app/debrief/Debrief";
import DebriefDetail       from "@/pages/app/debrief/DebriefDetail";

// ── Pages: Practice Rooms ─────────────────────────────────────────────────────
import PracticeRooms       from "@/pages/app/rooms/PracticeRooms";
import NewRoom             from "@/pages/app/rooms/NewRoom";
import RoomSession         from "@/pages/app/rooms/RoomSession";

// ── Pages: Settings ───────────────────────────────────────────────────────────
import Settings            from "@/pages/app/settings/Settings";
import SettingsProfile     from "@/pages/app/settings/SettingsProfile";
import SettingsAudio       from "@/pages/app/settings/SettingsAudio";
import SettingsModels      from "@/pages/app/settings/SettingsModels";
import SettingsBilling     from "@/pages/app/settings/SettingsBilling";
import SettingsNotifications from "@/pages/app/settings/SettingsNotifications";
import SettingsPrivacy     from "@/pages/app/settings/SettingsPrivacy";
import SettingsSecurity    from "@/pages/app/settings/SettingsSecurity";
import SettingsIntegrations from "@/pages/app/settings/SettingsIntegrations";
import SettingsBYOK        from "@/pages/app/settings/SettingsBYOK";
import SettingsAppearance  from "@/pages/app/settings/SettingsAppearance";
import SettingsSubscription from "@/pages/app/settings/SettingsSubscription";
import SettingsCredits     from "@/pages/app/settings/SettingsCredits";
import SettingsData        from "@/pages/app/settings/SettingsData";
import SettingsDanger      from "@/pages/app/settings/SettingsDanger";

// ── Pages: Marketing ──────────────────────────────────────────────────────────
import Landing             from "@/pages/marketing/Landing";
import Pricing             from "@/pages/marketing/Pricing";
import Help                from "@/pages/marketing/Help";
import HelpArticle         from "@/pages/marketing/HelpArticle";
import Shortcuts           from "@/pages/marketing/Shortcuts";
import Blog                from "@/pages/marketing/Blog";
import BlogPost            from "@/pages/marketing/BlogPost";

// ── Pages: Admin ──────────────────────────────────────────────────────────────
// ✅ FIXED: all admin pages now point to pages/app/admin/ (canonical location)
import AdminDashboard      from "@/pages/app/admin/AdminDashboard";
import AdminUsers          from "@/pages/app/admin/AdminUsers";
import AdminAnalytics      from "@/pages/app/admin/AdminAnalytics";
import AdminFlags          from "@/pages/app/admin/AdminFlags";
import AdminRevenue        from "@/pages/app/admin/AdminRevenue";
import AdminModelCosts     from "@/pages/app/admin/AdminModelCosts";
import AdminFeatureFlags   from "@/pages/app/admin/AdminFeatureFlags";
import AdminLayout         from "@/pages/app/admin/AdminLayout";

// ── Pages: Misc ───────────────────────────────────────────────────────────────
import NotFound            from "@/pages/NotFound";

// ─────────────────────────────────────────────────────────────────────────────
// React Query client
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,       // 2 min
      gcTime:    1000 * 60 * 10,      // 10 min
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
// App shell layout (sidebar + topbar wrapping authenticated pages)
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
// Router
// ─────────────────────────────────────────────────────────────────────────────

const router = createBrowserRouter([

  // ── Public marketing routes ────────────────────────────────────────────────
  { path: "/",            element: <Landing /> },
  { path: "/pricing",     element: <Pricing /> },
  { path: "/help",        element: <Help /> },
  { path: "/help/:slug",  element: <HelpArticle /> },
  { path: "/shortcuts",   element: <Shortcuts /> },
  { path: "/blog",        element: <Blog /> },
  { path: "/blog/:slug",  element: <BlogPost /> },

  // ── Auth routes ────────────────────────────────────────────────────────────
  { path: "/login",           element: <Login /> },
  { path: "/signup",          element: <Signup /> },
  { path: "/verify-email",    element: <VerifyEmail /> },
  { path: "/forgot-password", element: <ResetPassword /> },  // ✅ NEW
  { path: "/reset-password",  element: <ResetPassword /> },  // ✅ NEW

  // ── Onboarding (auth required, no shell) ──────────────────────────────────
  // ✅ CHANGED: single route using OnboardingIndex orchestrator
  //    It handles step navigation internally with AnimatePresence
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/onboarding", element: <OnboardingIndex /> },
      // Keep legacy step URLs so any deep links still work
      { path: "/onboarding/step-1", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-2", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-3", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-4", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-5", element: <Navigate to="/onboarding" replace /> },
    ],
  },

  // ── Live overlay — chromeless, no shell ───────────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/app/live/overlay",       element: <LiveOverlay /> },
    ],
  },

  // ── Room session — full-screen, no sidebar ────────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/app/rooms/:roomId/session", element: <RoomSession /> },
    ],
  },

  // ── Main app shell (sidebar + topbar) ─────────────────────────────────────
  {
    path: "/app",
    element: <ProtectedRoute requireOnboarded />,    // ✅ ADDED: gate unboarded users
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },

          // Core
          { path: "dashboard",     element: <Dashboard /> },
          { path: "interview-day", element: <InterviewDay /> },
          { path: "analytics",     element: <Analytics /> },
          { path: "profile",       element: <Profile /> },
          { path: "notifications", element: <Notifications /> },
          { path: "referrals",     element: <Referrals /> },

          // Live
          { path: "live",          element: <LiveRehearsal /> },

          // Mock
          { path: "mock",          element: <MockInterview /> },
          { path: "mock/warmup",   element: <MockWarmup /> },
          { path: "mock/session",  element: <MockSession /> },

          // Prep Lab
          { path: "prep",                 element: <PrepLab /> },
          { path: "prep/star-builder",    element: <StarBuilder /> },
          { path: "prep/project-builder", element: <ProjectBuilder /> },
          { path: "prep/rephraser",       element: <Rephraser /> },
          { path: "prep/coding-hints",    element: <CodingHints /> },
          { path: "prep/system-design",   element: <SystemDesign /> },

          // Sessions
          { path: "sessions",     element: <SessionHistory /> },
          { path: "sessions/:id", element: <SessionDetail /> },

          // Documents
          { path: "documents",             element: <Documents /> },
          { path: "documents/resume/:id",  element: <ResumeDetail /> },
          { path: "documents/jd/:id",      element: <JDDetail /> },

          // Answer Bank
          { path: "answers",    element: <AnswerBank /> },
          { path: "answers/:id", element: <AnswerDetail /> },

          // Interviews
          { path: "interviews",      element: <Interviews /> },
          { path: "interviews/new",  element: <NewInterview /> },
          { path: "interviews/:id",  element: <InterviewDetail /> },

          // Company Research
          { path: "companies",     element: <CompanyResearch /> },
          { path: "companies/:id", element: <CompanyProfile /> },

          // Debrief
          { path: "debrief",     element: <Debrief /> },
          { path: "debrief/:id", element: <DebriefDetail /> },

          // Practice Rooms
          { path: "rooms",     element: <PracticeRooms /> },
          { path: "rooms/new", element: <NewRoom /> },

          // Settings
          {
            path: "settings",
            element: <Settings />,
            children: [
              { index: true,            element: <Navigate to="profile" replace /> },
              { path: "profile",        element: <SettingsProfile /> },
              { path: "audio",          element: <SettingsAudio /> },
              { path: "models",         element: <SettingsModels /> },
              { path: "billing",        element: <SettingsBilling /> },
              { path: "notifications",  element: <SettingsNotifications /> },
              { path: "privacy",        element: <SettingsPrivacy /> },
              { path: "security",       element: <SettingsSecurity /> },
              { path: "integrations",   element: <SettingsIntegrations /> },
              { path: "byok",           element: <SettingsBYOK /> },
              { path: "appearance",     element: <SettingsAppearance /> },
              { path: "subscription",   element: <SettingsSubscription /> },
              { path: "credits",        element: <SettingsCredits /> },
              { path: "data",           element: <SettingsData /> },
              { path: "danger",         element: <SettingsDanger /> },
            ],
          },

          // Admin — ✅ FIXED: uses AdminLayout with nested children
          {
            path: "admin",
            element: <ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>,
            children: [
              { index: true,               element: <AdminDashboard /> },
              { path: "users",             element: <AdminUsers /> },
              { path: "analytics",         element: <AdminAnalytics /> },
              { path: "flags",             element: <AdminFlags /> },
              { path: "revenue",           element: <AdminRevenue /> },
              { path: "model-costs",       element: <AdminModelCosts /> },
              { path: "feature-flags",     element: <AdminFeatureFlags /> },
            ],
          },
        ],
      },
    ],
  },

  // ── 404 ───────────────────────────────────────────────────────────────────
  { path: "*", element: <NotFound /> },
]);

// ─────────────────────────────────────────────────────────────────────────────
// Root App component
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const setSession  = useAuthStore((s) => s.setSession);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const theme       = useUIStore((s) => s.theme);

  // ── Supabase auth listener ─────────────────────────────────────────────────
  useEffect(() => {
    // Hydrate session on cold load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session as never);
      if (session?.user) {
        loadProfile();
      }
    });

    // Live auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session as never);

        if (session?.user) {
          loadProfile();

          if (import.meta.env.VITE_POSTHOG_KEY) {
            posthog.identify(session.user.id, {
              email: session.user.email,
            });
          }
        } else {
          if (import.meta.env.VITE_POSTHOG_KEY) posthog.reset();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [setSession, loadProfile]);

  // ── Theme sync → <html> element ───────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("data-theme", theme);
    localStorage.setItem("clarity-theme", theme);    // ✅ FIXED: key matches app name
  }, [theme]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />

        {/* Global toast — rendered outside RouterProvider so it survives navigation */}
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
