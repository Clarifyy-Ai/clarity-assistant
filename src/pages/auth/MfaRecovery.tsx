import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Shield } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";
import { confirmMfaEmailRecovery, recoveryErrorMessage } from "@/lib/auth/mfaRecoveryClient";
import { AUTH_PATHS } from "@/lib/auth/appOrigin";
import { usePageMeta } from "@/hooks/usePageMeta";

export default function MfaRecovery(): JSX.Element {
  usePageMeta({ title: "Confirm authenticator recovery | Career Pilot", noIndex: true });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const status = useAuthStore((s) => s.status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError("This recovery link is missing a token. Request a new one from the sign-in screen.");
  }, [token]);

  async function confirm(): Promise<void> {
    if (!token || status !== "authenticated") {
      setError("Sign in with your password on this device first, then open the recovery link again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmMfaEmailRecovery(token);
      setDone(true);
      navigate(AUTH_PATHS.mfaEnroll, { replace: true });
    } catch (err) {
      setError(recoveryErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Confirm authenticator recovery</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          This proves you control the email on the account after signing in. It does not skip two-factor setup.
        </p>
        {error && (
          <div role="alert" className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {status !== "authenticated" ? (
          <Link
            to={`/login?returnTo=${encodeURIComponent(`${AUTH_PATHS.mfaRecovery}?token=${token}`)}`}
            className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Sign in to continue
          </Link>
        ) : (
          <Button type="button" variant="primary" fullWidth loading={busy} disabled={!token || done} onClick={() => void confirm()}>
            Confirm and replace authenticator
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
