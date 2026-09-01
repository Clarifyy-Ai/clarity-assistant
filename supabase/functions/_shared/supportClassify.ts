/**
 * Deno copy of src/lib/support/classify.ts — keep in sync.
 * Edge cannot import the Vite alias.
 */
export type SupportCategory =
  | "interview"
  | "gov_exams"
  | "billing"
  | "technical"
  | "account"
  | "general";

export type SupportIntent =
  | "credits"
  | "exam_job"
  | "payment"
  | "document_job"
  | "account_howto"
  | "interview_reason"
  | "escalate"
  | "faq"
  | "unclear";

export type SupportClassifyInput = {
  message: string;
  category?: string | null;
  sourcePath?: string | null;
  resourceHint?: { exam_id?: string; job_id?: string; document_id?: string } | null;
  escalateRequested?: boolean;
};

export type SupportClassifyResult = {
  intent: SupportIntent;
  category: SupportCategory;
  useAi: boolean;
  reason: string;
};

const CREDIT_RE = /\b(credit|credits|balance|plan|quota)\b/i;
const PAYMENT_RE =
  /\b(paid|payment|razorpay|refund|charged|receipt|invoice|order)\b/i;
const EXAM_RE =
  /\b(exam|mock|paper|generating|generation|upsc|ssc|gov(?:ernment)?)\b/i;
const STUCK_RE = /\b(stuck|failed|hang|hanging|not opening|won'?t open|timeout)\b/i;
const DOCUMENT_RE = /\b(resume|upload|parse|parser|ocr|document|cv)\b/i;
const ACCOUNT_RE =
  /\b(password|login|sign.?in|verify.?email|reset|account|2fa|mfa)\b/i;
const REASON_RE =
  /\b(why|how can i improve|explain|score|low score|feedback)\b/i;

const CATEGORIES: SupportCategory[] = [
  "interview",
  "gov_exams",
  "billing",
  "technical",
  "account",
  "general",
];

function asCategory(raw: string | null | undefined): SupportCategory | null {
  if (!raw) return null;
  return CATEGORIES.includes(raw as SupportCategory) ? (raw as SupportCategory) : null;
}

function categoryFromPath(path: string | null | undefined): SupportCategory | null {
  const p = (path ?? "").toLowerCase();
  if (p.includes("/gov") || p.includes("exam")) return "gov_exams";
  if (p.includes("/billing") || p.includes("/pricing") || p.includes("credit")) return "billing";
  if (p.includes("/live") || p.includes("interview") || p.includes("practice")) return "interview";
  if (p.includes("/login") || p.includes("/settings") || p.includes("/account")) return "account";
  if (p.includes("/documents") || p.includes("/resume")) return "technical";
  return null;
}

export function classifySupportRequest(input: SupportClassifyInput): SupportClassifyResult {
  const message = (input.message ?? "").trim();
  const fromChip = asCategory(input.category);
  const fromPath = categoryFromPath(input.sourcePath);
  const category = fromChip ?? fromPath ?? "general";

  if (input.escalateRequested) {
    return { intent: "escalate", category, useAi: false, reason: "user_requested_agent" };
  }

  if (PAYMENT_RE.test(message) && (CREDIT_RE.test(message) || /didn'?t receive|not received/i.test(message))) {
    return { intent: "payment", category: "billing", useAi: false, reason: "payment_records" };
  }
  if (CREDIT_RE.test(message) && !REASON_RE.test(message)) {
    return { intent: "credits", category: "billing", useAi: false, reason: "profile_credits" };
  }
  if (
    (EXAM_RE.test(message) && STUCK_RE.test(message)) ||
    Boolean(input.resourceHint?.job_id) ||
    (fromPath === "gov_exams" && STUCK_RE.test(message))
  ) {
    return { intent: "exam_job", category: "gov_exams", useAi: false, reason: "generation_job" };
  }
  if (DOCUMENT_RE.test(message) && (STUCK_RE.test(message) || /fail/i.test(message))) {
    return { intent: "document_job", category: "technical", useAi: false, reason: "document_job" };
  }
  if (ACCOUNT_RE.test(message) && !REASON_RE.test(message)) {
    return { intent: "account_howto", category: "account", useAi: false, reason: "static_faq" };
  }
  if (REASON_RE.test(message) || /improve this answer|explain this/i.test(message)) {
    return { intent: "interview_reason", category: fromChip ?? "interview", useAi: true, reason: "needs_reasoning" };
  }
  if (fromChip === "billing" && !message) {
    return { intent: "credits", category: "billing", useAi: false, reason: "chip_billing" };
  }
  if (fromChip === "gov_exams" && message.length < 40) {
    return { intent: "exam_job", category: "gov_exams", useAi: false, reason: "chip_gov" };
  }
  if (message.length < 8 && fromChip) {
    return { intent: "faq", category: fromChip, useAi: false, reason: "short_chip" };
  }
  return { intent: "unclear", category, useAi: true, reason: "ambiguous" };
}

export const ACCOUNT_HOWTO_REPLY =
  "You can reset your password from the login screen → Forgot password. Check the inbox (and spam) for the reset link. Opening this chat does not change your password. If you still cannot sign in, choose Talk to Support and an agent will help.";
