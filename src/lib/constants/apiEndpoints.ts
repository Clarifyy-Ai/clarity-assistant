// ─────────────────────────────────────────────────────────────────────────────
// apiEndpoints.ts — All external API URLs, Supabase edge function names,
// and internal route constants. Single source of truth for every endpoint.
// ─────────────────────────────────────────────────────────────────────────────

import { ENV } from "@/lib/env";

// ─── Environment Base URLs ────────────────────────────────────────────────────

export const BASE_URLS = {
  SUPABASE:   ENV.SUPABASE_URL,
  APP:        ENV.APP_URL || window.location.origin,
  API:        ENV.API_URL,
} as const;

// ─── Supabase Edge Functions ──────────────────────────────────────────────────
// These match the folder names under /supabase/functions/

export const EDGE_FUNCTIONS = {
  // AI Generation
  GENERATE_ANSWER:        "generate-answer",
  GENERATE_HINT:          "generate-hint",
  GENERATE_STAR:          "generate-star-answer",
  GENERATE_DEBRIEF:       "generate-debrief",
  GENERATE_SCORECARD:     "generate-scorecard",
  GENERATE_REPHRASE:      "prep-tool",
  GENERATE_COACH_REPLY:   "ai-coach-chat",
  COMPANY_RESEARCH:       "company-research",
  CODING_HINT:            "generate-hint",
  SYSTEM_DESIGN:          "prep-tool",
  RESUME_ANALYSIS:        "parse-resume",

  // Audio / Transcription
  DEEPGRAM_TOKEN:         "deepgram-token",

  // Billing
  CREATE_CHECKOUT:        "create-checkout",
  CREATE_BILLING_PORTAL:  "create-billing-portal",
  CANCEL_SUBSCRIPTION:    "cancel-subscription",
  RESUME_SUBSCRIPTION:    "resume-subscription",
  DEDUCT_CREDITS:         "deduct-credits",
  WEBHOOK_STRIPE:         "stripe-webhook",
  RECORD_REFERRAL:        "record-referral",

  // Auth & User / GDPR
  DELETE_ACCOUNT:         "delete-account",
  EXPORT_USER_DATA:       "export-user-data",

  // Notifications
  SEND_EMAIL:             "send-email",

  // Analytics & sessions
  ANALYTICS_DASHBOARD:    "analytics-dashboard",
  START_SESSION:          "start-session",
} as const;

export type EdgeFunctionName = (typeof EDGE_FUNCTIONS)[keyof typeof EDGE_FUNCTIONS];

// ─── External AI API Endpoints ────────────────────────────────────────────────

export const AI_ENDPOINTS = {
  OPENAI: {
    BASE:       "https://api.openai.com/v1",
    CHAT:       "https://api.openai.com/v1/chat/completions",
    MODELS:     "https://api.openai.com/v1/models",
    EMBEDDINGS: "https://api.openai.com/v1/embeddings",
  },
  ANTHROPIC: {
    BASE:       "https://api.anthropic.com/v1",
    MESSAGES:   "https://api.anthropic.com/v1/messages",
    MODELS:     "https://api.anthropic.com/v1/models",
  },
  GEMINI: {
    BASE:             "https://generativelanguage.googleapis.com/v1beta",
    GENERATE_CONTENT: (modelId: string) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
    STREAM_CONTENT: (modelId: string) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`,
  },
} as const;

// ─── Deepgram ─────────────────────────────────────────────────────────────────

export const DEEPGRAM_ENDPOINTS = {
  WS_LISTEN:  "wss://api.deepgram.com/v1/listen",
  REST_LISTEN:"https://api.deepgram.com/v1/listen",
  PROJECTS:   "https://api.deepgram.com/v1/projects",
} as const;

export const DEEPGRAM_WS_PARAMS = {
  MODEL:          "nova-2",
  LANGUAGE:       "en-US",
  PUNCTUATE:      true,
  DIARIZE:        true,
  SMART_FORMAT:   true,
  INTERIM_RESULTS:true,
  UTTERANCE_END_MS: 1000,
  VAD_EVENTS:     true,
  ENCODING:       "linear16",
  SAMPLE_RATE:    16000,
  CHANNELS:       1,
} as const;

// ─── Stripe ───────────────────────────────────────────────────────────────────

export const STRIPE_ENDPOINTS = {
  CHECKOUT:       "https://api.stripe.com/v1/checkout/sessions",
  SUBSCRIPTIONS:  "https://api.stripe.com/v1/subscriptions",
  CUSTOMERS:      "https://api.stripe.com/v1/customers",
  PORTAL:         "https://billing.stripe.com/p/login",
} as const;

// ─── Internal App API Routes ──────────────────────────────────────────────────

export const API_ROUTES = {
  // Sessions
  SESSIONS:              "/api/sessions",
  SESSION:               (id: string) => `/api/sessions/${id}`,
  SESSION_DEBRIEF:       (id: string) => `/api/sessions/${id}/debrief`,
  SESSION_TRANSCRIPT:    (id: string) => `/api/sessions/${id}/transcript`,

  // Interviews
  INTERVIEWS:            "/api/interviews",
  INTERVIEW:             (id: string) => `/api/interviews/${id}`,

  // Documents
  DOCUMENTS:             "/api/documents",
  DOCUMENT:              (id: string) => `/api/documents/${id}`,

  // AI
  AI_ANSWER:             "/api/ai/answer",
  AI_HINT:               "/api/ai/hint",
  AI_FEEDBACK:           "/api/ai/feedback",
  AI_STREAM:             "/api/ai/stream",

  // User
  PROFILE:               "/api/profile",
  CREDITS:               "/api/credits",
  SUBSCRIPTION:          "/api/subscription",

  // Health
  HEALTH:                "/api/health",
  PING:                  "/api/ping",
} as const;

// ─── App Navigation Routes ────────────────────────────────────────────────────

export const ROUTES = {
  // Public
  HOME:              "/",
  PRICING:           "/pricing",
  HELP:              "/help",
  TERMS:             "/terms",
  PRIVACY:           "/privacy",

  // Auth
  LOGIN:             "/login",
  SIGNUP:            "/signup",
  FORGOT_PASSWORD:   "/forgot-password",
  RESET_PASSWORD:    "/reset-password",
  VERIFY_EMAIL:      "/verify-email",
  AUTH_CALLBACK:     "/auth/callback",

  // App (protected) — matches src/App.tsx
  DASHBOARD:         "/app/dashboard",
  DEBRIEFS:          "/app/debriefs",
  DEBRIEF:           (id: string) => `/app/debriefs/${id}`,
  GUIDE:             "/app/guide",
  GUIDE_PRACTICE_COACH: "/app/guide/practice-coach",
  LIVE_SESSION:      "/app/live",
  SESSION:           (id: string) => `/app/sessions/${id}`,
  MOCK_INTERVIEW:    "/app/mock",
  MOCK_TEST:         "/app/mock-test",
  ANSWER_BANK:       "/app/answers",
  PREP:              "/app/prep",
  ANALYTICS:         "/app/analytics",
  COMPANY_RESEARCH:  "/app/companies",
  INTERVIEWS:        "/app/interviews",

  // Settings
  SETTINGS:          "/app/settings",
  SETTINGS_PROFILE:  "/app/settings/profile",
  SETTINGS_BILLING:  "/app/settings/billing",
  SETTINGS_AUDIO:    "/app/settings/audio",
  SETTINGS_HOTKEYS:  "/app/settings/hotkeys",
  SETTINGS_PRIVACY:  "/app/settings/privacy",
  SETTINGS_AI:       "/app/settings/models",
} as const;

export type AppRoute = string;
