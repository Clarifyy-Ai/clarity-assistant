// ─── AI Clients ───────────────────────────────────────────────────────────────
export { streamClaudeHint } from "./anthropicClient";
export type { ClaudeStreamOptions } from "./anthropicClient";
export { streamOpenAIHint } from "./openaiClient";
export type { OpenAIStreamOptions } from "./openaiClient";
export { streamGeminiHint, consumeSSEStream } from "./geminiClient";
export type { GeminiStreamOptions, GeminiModel } from "./geminiClient";

// ─── Model Router ─────────────────────────────────────────────────────────────
export { routeHint, selectModel } from "./modelRouter";
export type { RouteHintOptions } from "./modelRouter";

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
export { buildCoachingContext, buildContextFromStores } from "./contextEnvelopeBuilder";

// ─── Offline Templates ────────────────────────────────────────────────────────
export { getOfflineTemplate, getAllOfflineTemplates, getPanicResponse, OFFLINE_PANIC } from "./offlineTemplates";
