// ─────────────────────────────────────────────────────────────────────────────
// api.types.ts — API request/response envelope types, edge function
// payloads, HTTP primitives, and pagination contracts.
// ─────────────────────────────────────────────────────────────────────────────

// ─── HTTP Primitives ──────────────────────────────────────────────────────────

export type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HTTPStatus =
  | 200 | 201 | 204
  | 400 | 401 | 403 | 404 | 409 | 422 | 429
  | 500 | 502 | 503;

// ─── Generic Response Envelope ────────────────────────────────────────────────

export interface APISuccess<T = unknown> {
  success: true;
  data:    T;
  message?: string;
  meta?:   ResponseMeta;
}

export interface APIError {
  success:  false;
  error:    string;
  code:     string;
  details?: unknown;
  status?:  HTTPStatus;
}

export type APIResponse<T = unknown> = APISuccess<T> | APIError;

export interface ResponseMeta {
  page?:       number;
  pageSize?:   number;
  total?:      number;
  totalPages?: number;
  hasNext?:    boolean;
  hasPrev?:    boolean;
  cursor?:     string;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?:     number;
  pageSize?: number;
  cursor?:   string;
}

export interface PaginatedResponse<T> {
  items:      T[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
  cursor?:    string;
}

// ─── Sort & Filter ────────────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc";

export interface SortParams {
  sortBy?:  string;
  sortDir?: SortDirection;
}

export interface DateRangeFilter {
  from?: string;   // ISO date string
  to?:   string;
}

export interface FilterParams extends PaginationParams, SortParams {
  search?:    string;
  dateRange?: DateRangeFilter;
  [key: string]: unknown;
}

// ─── Edge Function Payloads ───────────────────────────────────────────────────

// generate-answer
export interface GenerateAnswerRequest {
  questionText:   string;
  resumeText?:    string;
  jobDescription?: string;
  company?:       string;
  interviewType?: string;
  model?:         string;
  stream?:        boolean;
  userId:         string;
}

export interface GenerateAnswerResponse {
  answer:         string;
  model:          string;
  tokensUsed:     number;
  creditsCharged: number;
  cached:         boolean;
}

// generate-hint
export interface GenerateHintRequest {
  questionText:  string;
  context?:      string;
  model?:        string;
  userId:        string;
}

export interface GenerateHintResponse {
  hint:           string;
  model:          string;
  creditsCharged: number;
}

// generate-feedback
export interface GenerateFeedbackRequest {
  questionText:  string;
  userAnswer:    string;
  resumeText?:   string;
  model?:        string;
  userId:        string;
}

export interface GenerateFeedbackResponse {
  feedback:       string;
  score:          number;          // 1–10
  strengths:      string[];
  improvements:   string[];
  model:          string;
  creditsCharged: number;
}

// generate-star
export interface GenerateSTARRequest {
  questionText:  string;
  resumeText?:   string;
  context?:      string;
  model?:        string;
  userId:        string;
}

export interface GenerateSTARResponse {
  situation:     string;
  task:          string;
  action:        string;
  result:        string;
  fullAnswer:    string;
  creditsCharged: number;
}

// generate-debrief
export interface GenerateDebriefRequest {
  sessionId:     string;
  transcript:    string;
  questions:     string[];
  answers:       string[];
  userId:        string;
}

export interface GenerateDebriefResponse {
  summary:          string;
  overallScore:     number;
  strengths:        string[];
  improvements:     string[];
  recommendations:  string[];
  questionBreakdown: DebriefQuestionItem[];
  creditsCharged:   number;
}

export interface DebriefQuestionItem {
  question:     string;
  answer:       string;
  score:        number;
  feedback:     string;
}

// generate-rephrase
export interface GenerateRephraseRequest {
  text:     string;
  style?:   "concise" | "detailed" | "casual" | "professional";
  model?:   string;
  userId:   string;
}

export interface GenerateRephraseResponse {
  rephrased:      string;
  creditsCharged: number;
}

// generate-coach-reply
export interface GenerateCoachReplyRequest {
  messages:   ChatMessage[];
  context?:   CoachContext;
  model?:     string;
  userId:     string;
}

export interface ChatMessage {
  role:    "user" | "assistant" | "system";
  content: string;
}

export interface CoachContext {
  resumeText?:    string;
  jobDescription?: string;
  company?:       string;
  targetRole?:    string;
  interviewType?: string;
}

export interface GenerateCoachReplyResponse {
  reply:          string;
  model:          string;
  creditsCharged: number;
}

// company-research
export interface CompanyResearchRequest {
  company:       string;
  role?:         string;
  userId:        string;
}

export interface CompanyResearchResponse {
  company:         string;
  overview:        string;
  culture:         string[];
  recentNews:      string[];
  interviewTips:   string[];
  likelySalaryRange?: string;
  creditsCharged:  number;
}

// analyze-resume
export interface AnalyzeResumeRequest {
  resumeText:     string;
  jobDescription?: string;
  userId:         string;
}

export interface AnalyzeResumeResponse {
  summary:         string;
  strengths:       string[];
  gaps:            string[];
  suggestions:     string[];
  atsScore:        number;        // 0–100
  keywords:        string[];
  creditsCharged:  number;
}

// deepgram-token
export interface DeepgramTokenRequest {
  userId:     string;
  sessionId?: string;
}

export interface DeepgramTokenResponse {
  token:     string;
  expiresAt: string;
}

// create-checkout-session
export interface CreateCheckoutRequest {
  planId:       string;
  interval:     "month" | "year";
  userId:       string;
  successUrl:   string;
  cancelUrl:    string;
}

export interface CreateCheckoutResponse {
  sessionId:   string;
  checkoutUrl: string;
}

// purchase-credits
export interface PurchaseCreditsRequest {
  creditPackId: string;
  userId:       string;
  successUrl:   string;
  cancelUrl:    string;
}

// delete-account
export interface DeleteAccountRequest {
  userId:        string;
  confirmation:  string;      // must equal "DELETE"
}

// send-invite
export interface SendInviteRequest {
  email:       string;
  role?:       string;
  invitedBy:   string;
  message?:    string;
}

// verify-byok (Bring Your Own Key)
export interface VerifyBYOKRequest {
  provider:  "openai" | "anthropic" | "gemini";
  apiKey:    string;
  userId:    string;
}

export interface VerifyBYOKResponse {
  valid:       boolean;
  provider:    string;
  modelsFound: string[];
  error?:      string;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export type StreamEventType =
  | "start"
  | "chunk"
  | "done"
  | "error"
  | "credits_deducted";

export interface StreamEvent {
  type:       StreamEventType;
  data?:      string;
  error?:     string;
  meta?:      Record<string, unknown>;
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

export interface StripeWebhookEvent {
  id:      string;
  type:    string;
  data:    { object: Record<string, unknown> };
  created: number;
}

// ─── Request Options ──────────────────────────────────────────────────────────

export interface RequestOptions {
  timeout?:     number;    // ms
  retries?:     number;
  retryDelay?:  number;    // ms
  signal?:      AbortSignal;
  headers?:     Record<string, string>;
}

export interface EdgeFunctionOptions extends RequestOptions {
  stream?:      boolean;
  onChunk?:     (chunk: string) => void;
  onComplete?:  (full: string) => void;
  onError?:     (error: Error) => void;
}
