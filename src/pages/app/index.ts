// ─────────────────────────────────────────────────────────────────────────────
// pages/app/index.ts — Master barrel export for every app page and sub-folder.
// Import any page from "@/pages/app" without touching deep paths.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Top-level app pages ──────────────────────────────────────────────────────

export { default as Dashboard }    from "./Dashboard";
export { default as Analytics }    from "./Analytics";
export { default as InterviewDay } from "./InterviewDay";
export { default as Notifications } from "./Notifications";
export { default as Profile }      from "./Profile";
export { default as Referrals }    from "./Referrals";

// ─── Admin ────────────────────────────────────────────────────────────────────

export {
  AdminLayout,
  AdminDashboard,
  AdminUsers,
  AdminAnalytics,
  AdminRevenue,
  AdminFeatureFlags,
  AdminModelCosts,
} from "./admin";

// ─── Answer Bank ──────────────────────────────────────────────────────────────

export { AnswerBank, AnswerDetail }         from "./answer-bank";

// ─── Company Research ─────────────────────────────────────────────────────────

export { CompanyResearch, CompanyProfile }  from "./company-research";

// ─── Debrief ──────────────────────────────────────────────────────────────────

export { Debrief, DebriefDetail }           from "./debrief";

// ─── Documents ────────────────────────────────────────────────────────────────

export { Documents, ResumeDetail, JDDetail } from "./documents";

// ─── Interviews ───────────────────────────────────────────────────────────────

export { Interviews, InterviewDetail, NewInterview } from "./interviews";

// ─── Live ─────────────────────────────────────────────────────────────────────

export {
  LiveOverlay,
  LiveRehearsal,
} from "./live";

// ─── Mock ─────────────────────────────────────────────────────────────────────

export { MockInterview, MockSession, MockWarmup } from "./mock";

// ─── Rooms (deprecated — routes redirect; modules removed) ───────────────────

// Practice rooms are retired. Keep route redirects in App.tsx only.

// ─── Prep ─────────────────────────────────────────────────────────────────────

export {
  PrepLab,
  StarBuilder,
  Rephraser,
  CodingHints,
  SystemDesign,
  ProjectBuilder,
} from "./prep";

// ─── Sessions ────────────────────────────────────────────────────────────────

export { SessionDetail } from "./sessions";

// ─── Settings ─────────────────────────────────────────────────────────────────

export {
  Settings,
  SettingsProfile,
  SettingsAppearance,
  SettingsAudio,
  SettingsBilling,
  SettingsModels,
  SettingsNotifications,
  SettingsIntegrations,
  SettingsSecurity,
  SettingsPrivacy,
  SettingsData,
  SettingsDanger,
} from "./settings";
