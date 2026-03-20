import { useEffect } from "react";
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

import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import VerifyEmail from "@/pages/auth/VerifyEmail";
import ResetPassword from "@/pages/auth/ResetPassword";

import OnboardingIndex from "@/pages/onboarding/OnboardingIndex";

import Dashboard from "@/pages/app/Dashboard";
import Analytics from "@/pages/app/Analytics";
import InterviewDay from "@/pages/app/InterviewDay";
import Profile from "@/pages/app/Profile";
import Notifications from "@/pages/app/Notifications";
import Referrals from "@/pages/app/Referrals";

import LiveRehearsal from "@/pages/app/live/LiveRehearsal";
import LiveOverlay from "@/pages/app/live/LiveOverlay";

import MockInterview from "@/pages/app/mock/MockInterview";
import MockSession from "@/pages/app/mock/MockSession";
import MockWarmup from "@/pages/app/mock/MockWarmup";

import PrepLab from "@/pages/app/prep/PrepLab";
import StarBuilder from "@/pages/app/prep/StarBuilder";
import ProjectBuilder from "@/pages/app/prep/ProjectBuilder";
import Rephraser from "@/pages/app/prep/Rephraser";
import CodingHints from "@/pages/app/prep/CodingHints";
import SystemDesign from "@/pages/app/prep/SystemDesign";

import SessionHistory from "@/pages/app/sessions/SessionHistory";
import SessionDetail from "@/pages/app/sessions/SessionDetail";

import Documents from "@/pages/app/documents/Documents";
import ResumeDetail from "@/pages/app/documents/ResumeDetail";
import JDDetail from "@/pages/app/documents/JDDetail";

import AnswerBank from "@/pages/app/answer-bank/AnswerBank";
import AnswerDetail from "@/pages/app/answer-bank/AnswerDetail";

import Interviews from "@/pages/app/interviews/Interviews";
import NewInterview from "@/pages/app/interviews/NewInterview";
import InterviewDetail from "@/pages/app/interviews/InterviewDetail";

import CompanyResearch from "@/pages/app/company-research/CompanyResearch";
import CompanyProfile from "@/pages/app/company-research/CompanyProfile";

import Debrief from "@/pages/app/debrief/Debrief";
import DebriefDetail from "@/pages/app/debrief/DebriefDetail";

import PracticeRooms from "@/pages/app/rooms/PracticeRooms";
import NewRoom from "@/pages/app/rooms/NewRoom";
import RoomSession from "@/pages/app/rooms/RoomSession";

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

import Landing from "@/pages/marketing/Landing";
import Pricing from "@/pages/marketing/Pricing";
import Help from "@/pages/marketing/Help";
import HelpArticle from "@/pages/marketing/HelpArticle";
import Shortcuts from "@/pages/marketing/Shortcuts";
import Blog from "@/pages/marketing/Blog";
import BlogPost from "@/pages/marketing/BlogPost";

import AdminDashboard from "@/pages/app/admin/AdminDashboard";
import AdminUsers from "@/pages/app/admin/AdminUsers";
import AdminAnalytics from "@/pages/app/admin/AdminAnalytics";
import AdminFlags from "@/pages/app/admin/AdminFlags";
import AdminRevenue from "@/pages/app/admin/AdminRevenue";
import AdminModelCosts from "@/pages/app/admin/AdminModelCosts";
import AdminFeatureFlags from "@/pages/app/admin/AdminFeatureFlags";
import AdminLayout from "@/pages/app/admin/AdminLayout";

import NotFound from "@/pages/NotFound";

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
// Router
// ─────────────────────────────────────────────────────────────────────────────

const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/pricing", element: <Pricing /> },
  { path: "/help", element: <Help /> },
  { path: "/help/:slug", element: <HelpArticle /> },
  { path: "/shortcuts", element: <Shortcuts /> },
  { path: "/blog", element: <Blog /> },
  { path: "/blog/:slug", element: <BlogPost /> },

  { path: "/login", element: <Login /> },
  { path: "/signup", element: <Signup /> },
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "/forgot-password", element: <ResetPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },

  {
    element: <ProtectedRoute />,
    children: [
      { path: "/onboarding", element: <OnboardingIndex /> },
      { path: "/onboarding/step-1", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-2", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-3", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-4", element: <Navigate to="/onboarding" replace /> },
      { path: "/onboarding/step-5", element: <Navigate to="/onboarding" replace /> },
    ],
  },

  {
    element: <ProtectedRoute />,
    children: [
      { path: "/app/live/overlay", element: <LiveOverlay /> },
      { path: "/app/rooms/:roomId/session", element: <RoomSession /> },
    ],
  },

  {
    path: "/app",
    element: <ProtectedRoute requireOnboarded />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },

          { path: "dashboard", element: <Dashboard /> },
          { path: "interview-day", element: <InterviewDay /> },
          { path: "analytics", element: <Analytics /> },
          { path: "profile", element: <Profile /> },
          { path: "notifications", element: <Notifications /> },
          { path: "referrals", element: <Referrals /> },

          { path: "live", element: <LiveRehearsal /> },

          { path: "mock", element: <MockInterview /> },
          { path: "mock/warmup", element: <MockWarmup /> },
          { path: "mock/session", element: <MockSession /> },

          { path: "prep", element: <PrepLab /> },
          { path: "prep/star-builder", element: <StarBuilder /> },
          { path: "prep/project-builder", element: <ProjectBuilder /> },
          { path: "prep/rephraser", element: <Rephraser /> },
          { path: "prep/coding-hints", element: <CodingHints /> },
          { path: "prep/system-design", element: <SystemDesign /> },

          { path: "sessions", element: <SessionHistory /> },
          { path: "sessions/:id", element: <SessionDetail /> },

          { path: "documents", element: <Documents /> },
          { path: "documents/resume/:id", element: <ResumeDetail /> },
          { path: "documents/jd/:id", element: <JDDetail /> },

          { path: "answers", element: <AnswerBank /> },
          { path: "answers/:id", element: <AnswerDetail /> },

          { path: "interviews", element: <Interviews /> },
          { path: "interviews/new", element: <NewInterview /> },
          { path: "interviews/:id", element: <InterviewDetail /> },

          { path: "companies", element: <CompanyResearch /> },
          { path: "companies/:id", element: <CompanyProfile /> },

          { path: "debrief", element: <Debrief /> },
          { path: "debrief/:id", element: <DebriefDetail /> },

          { path: "rooms", element: <PracticeRooms /> },
          { path: "rooms/new", element: <NewRoom /> },

          {
            path: "settings",
            element: <Settings />,
            children: [
              { index: true, element: <Navigate to="profile" replace /> },
              { path: "profile", element: <SettingsProfile /> },
              { path: "audio", element: <SettingsAudio /> },
              { path: "models", element: <SettingsModels /> },
              { path: "billing", element: <SettingsBilling /> },
              { path: "notifications", element: <SettingsNotifications /> },
              { path: "privacy", element: <SettingsPrivacy /> },
              { path: "security", element: <SettingsSecurity /> },
              { path: "integrations", element: <SettingsIntegrations /> },
              { path: "byok", element: <SettingsBYOK /> },
              { path: "appearance", element: <SettingsAppearance /> },
              { path: "subscription", element: <SettingsSubscription /> },
              { path: "credits", element: <SettingsCredits /> },
              { path: "data", element: <SettingsData /> },
              { path: "danger", element: <SettingsDanger /> },
            ],
          },

          {
            path: "admin",
            element: (
              <ProtectedRoute requireAdmin>
                <AdminLayout />
              </ProtectedRoute>
            ),
            children: [
              { index: true, element: <AdminDashboard /> },
              { path: "users", element: <AdminUsers /> },
              { path: "analytics", element: <AdminAnalytics /> },
              { path: "flags", element: <AdminFlags /> },
              { path: "revenue", element: <AdminRevenue /> },
              { path: "model-costs", element: <AdminModelCosts /> },
              { path: "feature-flags", element: <AdminFeatureFlags /> },
            ],
          },
        ],
      },
    ],
  },

  { path: "*", element: <NotFound /> },
]);

// ─────────────────────────────────────────────────────────────────────────────
// Root App component
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const theme = useUIStore((s) => s.theme);

  // Single initialize() call — authStore owns ALL auth logic
  // No supabase.auth calls here — eliminates the duplicate GoTrueClient warning
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
