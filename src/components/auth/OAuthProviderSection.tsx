import {
  AzureOAuthButton,
  GithubOAuthButton,
  GoogleOAuthButton,
  LinkedInOAuthButton,
} from "@/components/auth/OAuthButton";
import {
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
  () => JSX.Element
> = {
  google: () => <GoogleOAuthButton />,
  github: () => <GithubOAuthButton />,
  linkedin_oidc: () => <LinkedInOAuthButton />,
  azure: () => <AzureOAuthButton />,
};

export function OAuthProviderSection({
  dividerLabel,
}: OAuthProviderSectionProps): JSX.Element | null {
  const {
    availableProviders,
    misconfiguredProviders,
    checking,
    hasConfiguredProviders,
  } = useOAuthReadiness();

  if (!hasConfiguredProviders) {
    return null;
  }

  if (checking && availableProviders.length === 0) {
    return null;
  }

  if (availableProviders.length === 0) {
    return (
      <div
        className="mb-5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-center text-xs text-muted-foreground"
        role="status"
        data-testid="oauth-not-configured"
      >
        {OAUTH_NOT_CONFIGURED_MESSAGE}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {availableProviders.map((provider) => {
          const Button = PROVIDER_BUTTONS[provider];
          return <Button key={provider} />;
        })}
      </div>

      {misconfiguredProviders.length > 0 ? (
        <p
          className="mt-2 text-center text-[11px] text-muted-foreground px-2"
          role="status"
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
