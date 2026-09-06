const INDIA_TIMEZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

const INDIA_LOCALE_RE = /(^|[\-_])(IN|hi|bn|ta|te|mr|gu|kn|ml|pa|or|as|ur)([\-_]|$)/i;

/** Dev/test override: `true` | `false` | unset. Ignored in production. */
function envForceIndia(): boolean | null {
  const raw = import.meta.env.VITE_FORCE_INDIA_REGION;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

export function honorIndiaForceFlag(
  forced: boolean | null,
  isProd: boolean,
): boolean | null {
  if (forced !== null && !isProd) return forced;
  return null;
}

export function isIndiaTimezone(timezone: string | null | undefined): boolean {
  if (!timezone) return false;
  return INDIA_TIMEZONES.has(timezone.trim());
}

export function isIndiaLocale(locale: string | null | undefined): boolean {
  if (!locale) return false;
  const normalized = locale.trim();
  if (normalized.endsWith("-IN") || normalized === "en-IN" || normalized === "hi-IN") {
    return true;
  }
  return INDIA_LOCALE_RE.test(normalized);
}

export function detectIndiaFromBrowser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isIndiaTimezone(tz)) return true;
  } catch {
    /* ignore */
  }
  if (isIndiaLocale(navigator.language)) return true;
  return (navigator.languages ?? []).some((lang) => isIndiaLocale(lang));
}

/**
 * Gov exam prep is available worldwide — Indian government exams attract diaspora
 * and remote aspirants. `VITE_FORCE_INDIA_REGION` still overrides in non-prod for QA.
 *
 * Heuristics below remain exported for analytics / soft hints; they no longer gate access.
 */
export function resolveIsIndiaUser(profile?: {
  timezone?: string | null;
  locale?: string | null;
  region?: string | null;
  notification_prefs?: { region?: string } | null;
} | null): boolean {
  // Production bundles: gov exams always available (diaspora / remote aspirants).
  if (import.meta.env.PROD) return true;

  const isProd =
    import.meta.env.PROD &&
    String(import.meta.env.VITE_APP_ENV ?? "").toLowerCase() === "production";
  const forced = honorIndiaForceFlag(envForceIndia(), isProd);
  if (forced !== null) return forced;

  void profile;
  return true;
}
