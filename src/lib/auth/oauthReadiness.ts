import { supabase } from "@/lib/supabase/client";
import { buildOAuthCallbackUrl } from "@/lib/auth/oauthCallbackUrl";
import {
  isOAuthProbeMisconfiguredError,
  isOAuthProviderEnabled,
  type OAuthProviderId,
} from "@/lib/auth/oauthProviders";

export type OAuthAvailability = "checking" | "available" | "unavailable" | "unknown";

const PROBE_TTL_MS = 5 * 60 * 1000;

type ProbeCacheEntry = { status: Exclude<OAuthAvailability, "checking">; checkedAt: number };

const probeCache = new Map<OAuthProviderId, ProbeCacheEntry>();
const probeInflight = new Map<OAuthProviderId, Promise<Exclude<OAuthAvailability, "checking">>>();

export function clearOAuthReadinessCache(): void {
  probeCache.clear();
  probeInflight.clear();
}

function oauthScopes(provider: OAuthProviderId): string | undefined {
  return provider === "google" ? "email profile" : undefined;
}

/**
 * Preflight OAuth without leaving the page (`skipBrowserRedirect`).
 * Caches unavailable results so broken providers are not re-advertised.
 */
export async function probeOAuthProviderAvailability(
  provider: OAuthProviderId,
  windowOrigin?: string | null,
): Promise<Exclude<OAuthAvailability, "checking">> {
  if (!isOAuthProviderEnabled(provider)) {
    return "unavailable";
  }

  const now = Date.now();
  const cached = probeCache.get(provider);
  if (cached && now - cached.checkedAt < PROBE_TTL_MS) {
    return cached.status;
  }

  const inflight = probeInflight.get(provider);
  if (inflight) {
    return inflight;
  }

  const promise = (async (): Promise<Exclude<OAuthAvailability, "checking">> => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as "google",
        options: {
          redirectTo: buildOAuthCallbackUrl(windowOrigin),
          skipBrowserRedirect: true,
          scopes: oauthScopes(provider),
        },
      });

      if (!error && data?.url) {
        probeCache.set(provider, { status: "available", checkedAt: Date.now() });
        return "available";
      }

      if (isOAuthProbeMisconfiguredError(error)) {
        probeCache.set(provider, { status: "unavailable", checkedAt: Date.now() });
        return "unavailable";
      }

      return "unknown";
    } catch {
      return "unknown";
    } finally {
      probeInflight.delete(provider);
    }
  })();

  probeInflight.set(provider, promise);
  return promise;
}

export async function probeOAuthProvidersAvailability(
  providers: OAuthProviderId[],
  windowOrigin?: string | null,
): Promise<Record<OAuthProviderId, Exclude<OAuthAvailability, "checking">>> {
  const entries = await Promise.all(
    providers.map(async (provider) => [
      provider,
      await probeOAuthProviderAvailability(provider, windowOrigin),
    ] as const),
  );

  return Object.fromEntries(entries) as Record<
    OAuthProviderId,
    Exclude<OAuthAvailability, "checking">
  >;
}
