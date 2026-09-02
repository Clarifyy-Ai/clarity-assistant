import { useEffect, useState } from "react";

import {
  getEnabledOAuthProviders,
  type OAuthProviderId,
} from "@/lib/auth/oauthProviders";
import {
  probeOAuthProvidersAvailability,
  type OAuthAvailability,
} from "@/lib/auth/oauthReadiness";

type ResolvedAvailability = Exclude<OAuthAvailability, "checking">;

export interface UseOAuthReadinessResult {
  /** Per-provider availability after preflight (or while checking). */
  availability: Partial<Record<OAuthProviderId, OAuthAvailability>>;
  /** Providers that passed preflight and may be shown. */
  availableProviders: OAuthProviderId[];
  /** Build lists Google/etc. but preflight proved misconfigured. */
  misconfiguredProviders: OAuthProviderId[];
  checking: boolean;
  hasConfiguredProviders: boolean;
}

export function useOAuthReadiness(): UseOAuthReadinessResult {
  const configuredProviders = getEnabledOAuthProviders();
  const [availability, setAvailability] = useState<
    Partial<Record<OAuthProviderId, OAuthAvailability>>
  >(() =>
    Object.fromEntries(
      configuredProviders.map((provider) => [provider, "checking" as const]),
    ),
  );

  useEffect(() => {
    if (configuredProviders.length === 0) {
      setAvailability({});
      return;
    }

    let cancelled = false;

    setAvailability(
      Object.fromEntries(
        configuredProviders.map((provider) => [provider, "checking" as const]),
      ),
    );

    void probeOAuthProvidersAvailability(configuredProviders).then((results) => {
      if (cancelled) {
        return;
      }
      setAvailability(results);
    });

    return () => {
      cancelled = true;
    };
  }, [configuredProviders.join(",")]);

  const availableProviders = configuredProviders.filter(
    (provider) => availability[provider] === "available",
  );

  const misconfiguredProviders = configuredProviders.filter(
    (provider) => availability[provider] === "unavailable",
  );

  const checking = configuredProviders.some(
    (provider) => availability[provider] === "checking" || availability[provider] === undefined,
  );

  return {
    availability,
    availableProviders,
    misconfiguredProviders,
    checking,
    hasConfiguredProviders: configuredProviders.length > 0,
  };
}

export type { ResolvedAvailability };
