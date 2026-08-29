/** Centralized public contact details for marketing and legal pages. */

export const CONTACT_EMAIL = "hello@clarifyprep.com";
export const SALES_EMAIL = "sales@clarifyprep.com";
export const SUPPORT_EMAIL = "support@clarifyprep.com";
export const LEGAL_EMAIL = "legal@clarifyprep.com";
export const PRIVACY_EMAIL = "privacy@clarifyprep.com";
export const SECURITY_EMAIL = "security@clarifyprep.com";

export const STATUS_PAGE_URL =
  (import.meta.env.VITE_STATUS_PAGE_URL as string | undefined)?.trim() || "";

/** Public GitHub org (releases / source). Override with VITE_GITHUB_ORG_URL. */
export const GITHUB_ORG_URL =
  (import.meta.env.VITE_GITHUB_ORG_URL as string | undefined)?.trim() ||
  "https://github.com/Clarifyy-Ai";

/** Product / service brand name shown in UI and marketing. */
export const COMPANY_NAME = "Clarify AI";

/** Legal operator name for Terms, Privacy, footer, and email — not the registered entity suffix. */
export const LEGAL_ENTITY_NAME = "Payara Labs";
