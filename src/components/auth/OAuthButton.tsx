// @ts-nocheck
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Github, Mail } from 'lucide-react';

export interface OAuthProvider {
  name: 'google' | 'github';
  label: string;
  icon: React.ReactNode;
}

interface OAuthButtonProps {
  provider: OAuthProvider;
  onSuccess?: () => void;
}

export const OAuthButton = ({ provider, onSuccess }: OAuthButtonProps) => {
  const navigate = useNavigate();
  const { signInWithOAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleOAuthLogin = async () => {
    setIsLoading(true);

    try {
      const { error } = await signInWithOAuth(provider.name);

      if (error) {
        toast.error(error.message || `Failed to login with ${provider.label}`);
      } else {
        toast.success(`Successfully logged in with ${provider.label}`);

        if (onSuccess) {
          onSuccess();
        } else {
          navigate('/dashboard');
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : `Failed to login with ${provider.label}`;

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleOAuthLogin}
      disabled={isLoading}
      variant="outline"
      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 transition"
    >
      {isLoading ? (
        <>
          <Spinner className="h-4 w-4" />
          Connecting...
        </>
      ) : (
        <>
          {provider.icon}
          Continue with {provider.label}
        </>
      )}
    </Button>
  );
};

// Preset OAuth Buttons
export const GoogleOAuthButton = (
  props: Omit<OAuthButtonProps, 'provider'>
) => (
  <OAuthButton
    provider={{
      name: 'google',
      label: 'Google',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
    }}
    {...props}
  />
);

export const GithubOAuthButton = (
  props: Omit<OAuthButtonProps, 'provider'>
) => (
  <OAuthButton
    provider={{
      name: 'github',
      label: 'GitHub',
      icon: <Github className="h-5 w-5" />,
    }}
    {...props}
  />
);

export default OAuthButton;
