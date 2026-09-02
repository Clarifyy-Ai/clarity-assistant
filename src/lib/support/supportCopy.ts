export const SUPPORT_WIDGET_TITLE = "Career Pilot Support";
export const SUPPORT_WIDGET_SLA =
  "We typically reply within a few hours (India business hours, IST).";
export const SUPPORT_WIDGET_GREETING = "Hi! How can we help you today?";
export const SUPPORT_WIDGET_ARIA = "Contact support";
export const SUPPORT_COMPOSER_PLACEHOLDER = "Write a message…";
export const SUPPORT_SENDING_LABEL = "Sending…";
export const SUPPORT_FAILED_LABEL = "Could not send. Retry";
export const SUPPORT_MAX_BODY = 4000;
export const SUPPORT_CONNECT_TIMEOUT_MS = 8000;
export const SUPPORT_AI_TIMEOUT_MS = 20000;
/** Guest list poll floor — stay under support-chat's 8 req/min guest cap. */
export const SUPPORT_GUEST_POLL_MS = 15_000;
export const SUPPORT_WAITING_HINT =
  "Your conversation is saved. An agent will reply in this chat.";

export type SupportChipId =
  | "interview"
  | "gov_exams"
  | "billing"
  | "technical"
  | "account"
  | "escalate";

export const SUPPORT_CHIPS: Array<{
  id: SupportChipId;
  label: string;
  prompt: string | null;
  escalate?: boolean;
  category: "interview" | "gov_exams" | "billing" | "technical" | "account" | "general";
}> = [
  { id: "interview", label: "Interview Help", prompt: "I need help with interview practice.", category: "interview" },
  { id: "gov_exams", label: "Government Exams", prompt: "I need help with a government exam mock.", category: "gov_exams" },
  { id: "billing", label: "Billing & Credits", prompt: "I have a question about billing or credits.", category: "billing" },
  { id: "technical", label: "Technical Issue", prompt: "I am having a technical issue.", category: "technical" },
  { id: "account", label: "Account & Login", prompt: "I need help with my account or login.", category: "account" },
  { id: "escalate", label: "Talk to Support", prompt: "Talk to Support", category: "general", escalate: true },
];

export function canSubmitSupportMessage(opts: {
  sending: boolean;
  draft: string;
}): boolean {
  const text = opts.draft.trim();
  return !opts.sending && text.length > 0 && text.length <= SUPPORT_MAX_BODY;
}

export const SUPPORT_ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];
export const SUPPORT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export function validateSupportAttachment(file: File): string | null {
  if (!SUPPORT_ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return "Use a PNG, JPEG, WebP, or PDF (max 5 MB).";
  }
  if (file.size <= 0 || file.size > SUPPORT_MAX_ATTACHMENT_BYTES) {
    return "File must be 5 MB or smaller.";
  }
  return null;
}
