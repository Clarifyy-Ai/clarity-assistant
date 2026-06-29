const INDIA_TIMEZONES = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

const INDIA_LOCALE_RE = /(^|[\-_])(IN|hi|bn|ta|te|mr|gu|kn|ml|pa|or|as|ur)([\-_]|$)/i;

/** Dev/test override: `true` | `false` | unset */
function envForceIndia(): boolean | null {
  const raw = import.meta.env.VITE_FORCE_INDIA_REGION;
  if (raw === "true") return true;
  if (raw === "false") return false;
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

export function resolveIsIndiaUser(profile?: {
  timezone?: string | null;
  locale?: string | null;
} | null): boolean {
  const forced = envForceIndia();
  if (forced !== null) return forced;

  // Allow all users globally — gov exam access is no longer gated to India only.
  // The feature is useful to anyone preparing for Indian government exams worldwide.
  return true;
}
