import {
  AzureOAuthButton,
  GithubOAuthButton,
  GoogleOAuthButton,
  LinkedInOAuthButton,
} from "@/components/auth/OAuthButton";
import {
  getEnabledOAuthProviders,
  OAUTH_NOT_CONFIGURED_MESSAGE,
  type OAuthProviderId,
} from "@/lib/auth/oauthProviders";
import { useOAuthReadiness } from "@/hooks/useOAuthReadiness";

interface OAuthProviderSectionProps {
  /** Divider label between OAuth and email form. */
  dividerLabel: string;
}

const PROVIDER_BUTTONS: Record<
  OAuthProviderId,
  () => JSX.Element | null
> = {
  google: () => <GoogleOAuthButton />,
  github: () => <GithubOAuthButton />,
  linkedin_oidc: () => <LinkedInOAuthButton />,
  azure: () => <AzureOAuthButton />,
};

/**
 * Always renders allowlisted OAuth CTAs (Google by default).
 * Preflight may warn when a provider looks misconfigured, but does not hide
 * Continue with Google — click still surfaces a clear error if Auth is unset.
 */
export function OAuthProviderSection({
  dividerLabel,
}: OAuthProviderSectionProps): JSX.Element | null {
  const configuredProviders = getEnabledOAuthProviders();
  const { misconfiguredProviders, checking } = useOAuthReadiness();

  if (configuredProviders.length === 0) {
    return null;
  }

  const showMisconfiguredHint =
    !checking && misconfiguredProviders.length > 0;

  return (
    <>
      <div
        className={
          configuredProviders.length === 1
            ? "grid grid-cols-1 gap-2"
            : "grid grid-cols-2 gap-2"
        }
        data-testid="oauth-provider-section"
      >
        {configuredProviders.map((provider) => {
          const Button = PROVIDER_BUTTONS[provider];
          return <Button key={provider} />;
        })}
      </div>

      {showMisconfiguredHint ? (
        <p
          className="mt-2 text-center text-[11px] text-muted-foreground px-2"
          role="status"
          data-testid="oauth-not-configured"
        >
          {OAUTH_NOT_CONFIGURED_MESSAGE}
        </p>
      ) : null}

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">{dividerLabel}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
    </>
  );
}
