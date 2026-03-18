import { useEffect } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import posthog from "posthog-js";

import { useAuthStore } from "@/store/userStore";
import { useUIStore } from "@/store/uiStore";
import { supabase } from "@/lib/supabase/client";

import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { MobileNav } from "@/components/layout/MobileNav";
import { NetworkBanner } from "@/components/layout/NetworkBanner";
import { Toaster } from "sonner";

// ── Pages: Auth ────────────────────────────────────────────────────
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import VerifyEmail from "@/pages/auth/VerifyEmail";

// ── Pages: Onboarding ──────────────────────────────────────────────
import OnboardingStep1Role from "@/pages/onboarding/OnboardingStep1Role";
import OnboardingStep2Experience from "@/pages/onboarding/OnboardingStep2Experience";
import OnboardingStep3Preferences from "@/pages/onboarding/OnboardingStep3Preferences";
import OnboardingStep4AudioSetup from "@/pages/onboarding/OnboardingStep4AudioSetup";
import OnboardingStep5ResumeUpload from "@/pages/onboarding/OnboardingStep5ResumeUpload";

// ── Pages: App Core ────────────────────────────────────────────────
import Dashboard from "@/pages/app/Dashboard";
import Analytics from "@/pages/app/Analytics";
import InterviewDay from "@/pages/app/InterviewDay";
import Profile from "@/pages/app/Profile";
import Notifications from "@/pages/app/Notifications";
import Referrals from "@/pages/app/Referrals";

// ── Pages: Live ────────────────────────────────────────────────────
import LiveRehearsal from "@/pages/app/live/LiveRehearsal";
import LiveOverlay from "@/pages/app/live/LiveOverlay";

// ── Pages: Mock ────────────────────────────────────────────────────
import MockInterview from "@/pages/app/mock/MockInterview";
import MockSession from "@/pages/app/mock/MockSession";
import MockWarmup from "@/pages/app/mock/MockWarmup";

// ── Pages: Prep Lab ────────────────────────────────────────────────
import PrepLab from "@/pages/app/prep/PrepLab";
import StarBuilder from "@/pages/app/prep/StarBuilder";
import ProjectBuilder from "@/pages/app/prep/ProjectBuilder";
import Rephraser from "@/pages/app/prep/Rephraser";
import CodingHints from "@/pages/app/prep/CodingHints";
import SystemDesign from "@/pages/app/prep/SystemDesign";

// ── Pages: Sessions ────────────────────────────────────────────────
import SessionHistory from "@/pages/app/sessions/SessionHistory";
import SessionDetail from "@/pages/app/sessions/SessionDetail";

// ── Pages: Documents ──────────────────────────────────────────────
import Documents from "@/pages/app/documents/Documents";
import ResumeDetail from "@/pages/app/documents/ResumeDetail";
import JDDetail from "@/pages/app/documents/JDDetail";

// ── Pages: Answer Bank ────────────────────────────────────────────
import AnswerBank from "@/pages/app/answer-bank/AnswerBank";
import AnswerDetail from "@/pages/app/answer-bank/AnswerDetail";

// ── Pages: Interviews ─────────────────────────────────────────────
import Interviews from "@/pages/app/interviews/Interviews";
import NewInterview from "@/pages/app/interviews/NewInterview";
import InterviewDetail from "@/pages/app/interviews/InterviewDetail";

// ── Pages: Company Research ───────────────────────────────────────
import CompanyResearch from "@/pages/app/company-research/CompanyResearch";
import CompanyProfile from "@/pages/app/company-research/CompanyProfile";

// ── Pages: Debrief ────────────────────────────────────────────────
import Debrief from "@/pages/app/debrief/Debrief";
import DebriefDetail from "@/pages/app/debrief/DebriefDetail";

// ── Pages: Rooms ──────────────────────────────────────────────────
import PracticeRooms from "@/pages/app/rooms/PracticeRooms";
import NewRoom from "@/pages/app/rooms/NewRoom";
import RoomSession from "@/pages/app/rooms/RoomSession";

// ── Pages: Settings ───────────────────────────────────────────────
import Settings from "@/pages/app/settings/Settings";
import SettingsProfile from "@/pages/app/settings/SettingsProfile";
import SettingsAudio from "@/pages/app/settings/SettingsAudio";
import SettingsModels from "@/pages/app/settings/SettingsModels";
import SettingsBilling from "@/pages/app/settings/SettingsBilling";
import SettingsNotifications from "@/pages/app/settings/SettingsNotifications";
import SettingsPrivacy from "@/pages/app/settings/SettingsPrivacy";
import SettingsSecurity from "@/pages/app/settings/SettingsSecurity";
import SettingsIntegrations from "@/pages/app/settings/SettingsIntegrations";
import SettingsBYOK from "@/pages/app/settings/SettingsBYOK";
import SettingsAppearance from "@/pages/app/settings/SettingsAppearance";
import SettingsSubscription from "@/pages/app/settings/SettingsSubscription";
import SettingsCredits from "@/pages/app/settings/SettingsCredits";
import SettingsData from "@/pages/app/settings/SettingsData";
import SettingsDanger from "@/pages/app/settings/SettingsDanger";

// ── Pages: Marketing ──────────────────────────────────────────────
import Landing from "@/pages/marketing/Landing";
import Pricing from "@/pages/marketing/Pricing";
import Help from "@/pages/marketing/Help";
import HelpArticle from "@/pages/marketing/HelpArticle";
import Shortcuts from "@/pages/marketing/Shortcuts";
import Blog from "@/pages/marketing/Blog";
import BlogPost from "@/pages/marketing/BlogPost";

// ── Pages: Admin ──────────────────────────────────────────────────
import Admin from "@/pages/admin/Admin";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminRevenue from "@/pages/admin/AdminRevenue";
import AdminModelCosts from "@/pages/admin/AdminModelCosts";
import AdminFeatureFlags from "@/pages/admin/AdminFeatureFlags";

import NotFound from "@/pages/NotFound";

// ─────────────────────────────────────────────────────────────────
// React Query client
// ─────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,       // 2 min
      gcTime: 1000 * 60 * 10,         // 10 min
      retry: (failureCount, error: unknown) => {
        // Don't retry on 4xx errors
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
    mutations: {
      retry: 0,
    },
  },
});

// ─────────────────────────────────────────────────────────────────
// App shell layout (authenticated pages)
// ─────────────────────────────────────────────────────────────────
function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Collapsible left sidebar */}
      <AppSidebar />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar: credit meter, bell, user menu */}
        <AppTopBar />

        {/* Network degradation banner */}
        <NetworkBanner />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <MobileNav />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  // ── Public marketing routes ──────────────────────────────────
  { path: "/",            element: <Landing /> },
  { path: "/pricing",     element: <Pricing /> },
  { path: "/help",        element: <Help /> },
  { path: "/help/:slug",  element: <HelpArticle /> },
  { path: "/shortcuts",   element: <Shortcuts /> },
  { path: "/blog",        element: <Blog /> },
  { path: "/blog/:slug",  element: <BlogPost /> },

  // ── Auth routes ───────────────────────────────────────────────
  { path: "/login",        element: <Login /> },
  { path: "/signup",       element: <Signup /> },
  { path: "/verify-email", element: <VerifyEmail /> },

  // ── Onboarding (auth required, no shell) ─────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/onboarding/step-1", element: <OnboardingStep1Role /> },
      { path: "/onboarding/step-2", element: <OnboardingStep2Experience /> },
      { path: "/onboarding/step-3", element: <OnboardingStep3Preferences /> },
      { path: "/onboarding/step-4", element: <OnboardingStep4AudioSetup /> },
      { path: "/onboarding/step-5", element: <OnboardingStep5ResumeUpload /> },
    ],
  },

  // ── Live overlay — minimal, no shell ─────────────────────────
  {
    element: <ProtectedRoute />,
    children: [{ path: "/app/live/overlay", element: <LiveOverlay /> }],
  },

  // ── Room session — no sidebar during active room ──────────────
  {
    element: <ProtectedRoute />,
    children: [{ path: "/app/rooms/:roomId/session", element: <RoomSession /> }],
  },

  // ── Main app shell (sidebar + topbar) ────────────────────────
  {
    path: "/app",
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          // Redirect /app → /app/dashboard
          { index: true,                    element: <Navigate to="dashboard" replace /> },

          // Dashboard
          { path: "dashboard",              element: <Dashboard /> },
          { path: "interview-day",          element: <InterviewDay /> },

          // Live
          { path: "live",                   element: <LiveRehearsal /> },

          // Mock
          { path: "mock",                   element: <MockInterview /> },
          { path: "mock/warmup",            element: <MockWarmup /> },
          { path: "mock/session",           element: <MockSession /> },

          // Prep Lab
          { path: "prep",                   element: <PrepLab /> },
          { path: "prep/star-builder",      element: <StarBuilder /> },
          { path: "prep/project-builder",   element: <ProjectBuilder /> },
          { path: "prep/rephraser",         element: <Rephraser /> },
          { path: "prep/coding-hints",      element: <CodingHints /> },
          { path: "prep/system-design",     element: <SystemDesign /> },

          // Sessions
          { path: "sessions",               element: <SessionHistory /> },
          { path: "sessions/:id",           element: <SessionDetail /> },

          // Analytics
          { path: "analytics",              element: <Analytics /> },

          // Documents
          { path: "documents",              element: <Documents /> },
          { path: "documents/resume/:id",   element: <ResumeDetail /> },
          { path: "documents/jd/:id",       element: <JDDetail /> },

          // Answer Bank
          { path: "answers",                element: <AnswerBank /> },
          { path: "answers/:id",            element: <AnswerDetail /> },

          // Interviews
          { path: "interviews",             element: <Interviews /> },
          { path: "interviews/new",         element: <NewInterview /> },
          { path: "interviews/:id",         element: <InterviewDetail /> },

          // Company Research
          { path: "companies",              element: <CompanyResearch /> },
          { path: "companies/:id",          element: <CompanyProfile /> },

          // Debrief
          { path: "debrief",                element: <Debrief /> },
          { path: "debrief/:id",            element: <DebriefDetail /> },

          // Practice Rooms
          { path: "rooms",                  element: <PracticeRooms /> },
          { path: "rooms/new",              element: <NewRoom /> },

          // Profile, Notifications, Referrals
          { path: "profile",                element: <Profile /> },
          { path: "notifications",          element: <Notifications /> },
          { path: "referrals",              element: <Referrals /> },

          // Settings hub + sub-pages
          {
            path: "settings",
            element: <Settings />,
            children: [
              { index: true,               element: <Navigate to="profile" replace /> },
              { path: "profile",           element: <SettingsProfile /> },
              { path: "audio",             element: <SettingsAudio /> },
              { path: "models",            element: <SettingsModels /> },
              { path: "billing",           element: <SettingsBilling /> },
              { path: "notifications",     element: <SettingsNotifications /> },
              { path: "privacy",           element: <SettingsPrivacy /> },
              { path: "security",          element: <SettingsSecurity /> },
              { path: "integrations",      element: <SettingsIntegrations /> },
              { path: "byok",              element: <SettingsBYOK /> },
              { path: "appearance",        element: <SettingsAppearance /> },
              { path: "subscription",      element: <SettingsSubscription /> },
              { path: "credits",           element: <SettingsCredits /> },
              { path: "data",              element: <SettingsData /> },
              { path: "danger",            element: <SettingsDanger /> },
            ],
          },
        ],
      },
    ],
  },

  // ── Admin (auth + admin role required) ───────────────────────
  {
    element: <ProtectedRoute requireAdmin />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/app/admin",              element: <Admin /> },
          { path: "/app/admin/users",        element: <AdminUsers /> },
          { path: "/app/admin/revenue",      element: <AdminRevenue /> },
          { path: "/app/admin/model-costs",  element: <AdminModelCosts /> },
          { path: "/app/admin/feature-flags",element: <AdminFeatureFlags /> },
        ],
      },
    ],
  },

  // ── 404 ───────────────────────────────────────────────────────
  { path: "*", element: <NotFound /> },
]);

// ─────────────────────────────────────────────────────────────────
// Root App component
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const { setSession, setUser, setProfile } = useAuthStore();
  const { theme } = useUIStore();

  // ── Supabase auth listener ──────────────────────────────────
  useEffect(() => {
    // Hydrate session on first load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setUser(session.user);
        loadProfile(session.user.id);
      }
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          setUser(session.user);
          loadProfile(session.user.id);
          // Identify user in PostHog
          posthog.identify(session.user.id, {
            email: session.user.email,
          });
        } else {
          setUser(null);
          setProfile(null);
          posthog.reset();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [setSession, setUser, setProfile]);

  // ── Sync theme class on html element ───────────────────────
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("data-theme", theme);
    localStorage.setItem("confideq-theme", theme);
  }, [theme]);

  // ── Load user profile from Supabase ────────────────────────
  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) setProfile(data);
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {/* Global toast system */}
      <Toaster
        position="bottom-right"
        expand={false}
        richColors
        closeButton
        toastOptions={{
          duration: 4000,
          classNames: {
            toast: "font-sans text-sm",
          },
        }}
      />
    </QueryClientProvider>
  );
}
