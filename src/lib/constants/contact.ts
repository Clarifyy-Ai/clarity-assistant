/** Centralized public contact details for marketing and legal pages. */

/** Single public mailbox for Career Pilot. */
export const UNIVERSAL_EMAIL = "hello@trycareerpilot.com";

export const CONTACT_EMAIL = UNIVERSAL_EMAIL;
export const SALES_EMAIL = UNIVERSAL_EMAIL;
export const SUPPORT_EMAIL = UNIVERSAL_EMAIL;
export const LEGAL_EMAIL = UNIVERSAL_EMAIL;
export const PRIVACY_EMAIL = UNIVERSAL_EMAIL;
export const SECURITY_EMAIL = UNIVERSAL_EMAIL;

export const STATUS_PAGE_URL =
  (import.meta.env.VITE_STATUS_PAGE_URL as string | undefined)?.trim() || "";

/** Public GitHub org (releases / source). Override with VITE_GITHUB_ORG_URL. */
export const GITHUB_ORG_URL =
  (import.meta.env.VITE_GITHUB_ORG_URL as string | undefined)?.trim() ||
  "https://github.com/Clarifyy-Ai";

/** Product / service brand name shown in UI and marketing. */
export const COMPANY_NAME = "Career Pilot";

/** Legal operator name for Terms, Privacy, footer, and email — not the registered entity suffix. */
export const LEGAL_ENTITY_NAME = "Payara Labs";
