const PLACEHOLDER_RE = /changeme|your_|placeholder|xxx|_here|example\.com|not-set|todo/i;

export function isMissingOrPlaceholderEnv(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  if (!v) return true;
  return PLACEHOLDER_RE.test(v);
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export type CriticalSupabaseEnv = {
  url: string;
  anonKey: string;
};

/**
 * Critical frontend config. Production/failClosed throws without leaking values.
 * Local/dev may use public fallbacks so Vitest and `npm run dev` still boot.
 */
export function resolveCriticalSupabaseEnv(opts: {
  url: string | undefined;
  anonKey: string | undefined;
  publishableKey: string | undefined;
  failClosed: boolean;
  fallbackUrl: string;
  fallbackKey: string;
}): CriticalSupabaseEnv {
  const urlRaw = String(opts.url ?? "").trim();
  const keyRaw = String(opts.anonKey ?? opts.publishableKey ?? "").trim()
    || String(opts.publishableKey ?? "").trim();

  if (opts.failClosed) {
    if (isMissingOrPlaceholderEnv(urlRaw) || !isValidHttpUrl(urlRaw)) {
      throw new Error("Missing required environment variable: VITE_SUPABASE_URL");
    }
    if (isMissingOrPlaceholderEnv(keyRaw)) {
      throw new Error(
        "Missing required environment variable: VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_PUBLISHABLE_KEY",
      );
    }
    return { url: urlRaw.replace(/\/+$/, ""), anonKey: keyRaw };
  }

  const url = !isMissingOrPlaceholderEnv(urlRaw) && isValidHttpUrl(urlRaw)
    ? urlRaw.replace(/\/+$/, "")
    : opts.fallbackUrl.replace(/\/+$/, "");
  const anonKey = !isMissingOrPlaceholderEnv(keyRaw) ? keyRaw : opts.fallbackKey;
  return { url, anonKey };
}
