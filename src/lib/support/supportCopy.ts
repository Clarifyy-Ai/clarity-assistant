export const SUPPORT_WIDGET_TITLE = "Support";
export const SUPPORT_WIDGET_SLA =
  "We typically reply within a few hours (India business hours, IST).";
export const SUPPORT_WIDGET_ARIA = "Contact support";
export const SUPPORT_COMPOSER_PLACEHOLDER = "Write a message…";
export const SUPPORT_SENDING_LABEL = "Sending…";
export const SUPPORT_FAILED_LABEL = "Could not send. Retry";
export const SUPPORT_MAX_BODY = 4000;

export function canSubmitSupportMessage(opts: {
  sending: boolean;
  draft: string;
}): boolean {
  const text = opts.draft.trim();
  return !opts.sending && text.length > 0 && text.length <= SUPPORT_MAX_BODY;
}
