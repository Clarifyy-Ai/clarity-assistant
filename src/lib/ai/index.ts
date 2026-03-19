// ─── AI Clients ───────────────────────────────────────────────────────────────
export { anthropic, callAnthropic, streamAnthropic } from "./anthropicClient";
export { openai, callOpenAI, streamOpenAI } from "./openaiClient";
export { gemini, callGemini, streamGemini } from "./geminiClient";

// ─── Model Router ─────────────────────────────────────────────────────────────
export {
  routeToModel,
  selectBestModel,
  getModelConfig,
} from "./modelRouter";

// ─── Prompt Templates ─────────────────────────────────────────────────────────
export {
  buildPrompt,
  PROMPT_TEMPLATES,
  LIVE_ANSWER,
  LIVE_HINT,
  LIVE_FEEDBACK,
  STAR_BUILDER,
  REPHRASER,
  COMPANY_RESEARCH,
  CODING_HINT,
  SYSTEM_DESIGN,
  SESSION_DEBRIEF,
  AI_COACH_CHAT,
  EMAIL_CONTENT,
} from "./promptTemplates";

export type {
  PromptContext,
  PromptTemplate,
  PromptTemplateKey,
} from "./promptTemplates";

// ─── Context Envelope Builder ─────────────────────────────────────────────────
export {
  buildContextEnvelope,
  buildMinimalEnvelope,
} from "./contextEnvelopeBuilder";

// ─── Offline Templates ────────────────────────────────────────────────────────
export {
  getOfflineAnswer,
  getOfflineHint,
  OFFLINE_ANSWERS,
} from "./offlineTemplates";
