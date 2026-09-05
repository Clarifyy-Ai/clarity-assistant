import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/store/authStore";
import {
  MFA_TOTP_FRIENDLY_NAME,
  collectMfaFactors,
  findUnverifiedTotp,
  isFriendlyNameConflictError,
} from "@/lib/auth/mfaFactors";
import { completeMfaReenrollment, recoveryErrorMessage } from "@/lib/auth/mfaRecoveryClient";
import { getAuthenticatedEntryPath, resolveOnboardingCompletedForRedirect } from "@/lib/auth/postAuthRedirect";
import { preferredReturnToFromNavigation } from "@/lib/auth/safeReturnTo";
import { AUTH_PATHS } from "@/lib/auth/appOrigin";
import { usePageMeta } from "@/hooks/usePageMeta";

/**
 * Forced new-authenticator enrollment after lost-device recovery.
 * Does not grant app access until TOTP is verified (AAL2).
 */
export default function MfaEnroll(): JSX.Element {
  usePageMeta({ title: "Set up authenticator | Career Pilot", noIndex: true });
  const navigate = useNavigate();
  const location = useLocation();
  const authStatus = useAuthStore((s) => s.status);
  const preferredReturnTo = preferredReturnToFromNavigation({
    locationState: location.state,
  });
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  async function startEnroll(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { data: listed } = await supabase.auth.mfa.listFactors();
      const stale = findUnverifiedTotp(collectMfaFactors(listed));
      for (const factor of stale) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: MFA_TOTP_FRIENDLY_NAME,
      });
      if (enrollErr) {
        if (isFriendlyNameConflictError(enrollErr.message)) {
          throw new Error("An authenticator setup is already in progress. Refresh and try again.");
        }
        throw enrollErr;
      }
      setFactorId(data.id);
      setQrCode(data.totp?.qr_code ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start authenticator setup.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnroll(): Promise<void> {
    if (!factorId || code.replace(/\D/g, "").length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const challengeId = challenge?.id?.trim();
      if (!challengeId) throw new Error("Could not start verification. Try again.");
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.replace(/\D/g, ""),
      });
      if (vErr) throw vErr;
      await supabase.auth.refreshSession();
      await completeMfaReenrollment();
      const { issueMfaRecoveryCodes } = await import("@/lib/auth/mfaRecoveryClient");
      try {
        const codes = await issueMfaRecoveryCodes();
        setRecoveryCodes(codes);
      } catch {
        setRecoveryCodes([]);
      }
    } catch (err) {
      setError(recoveryErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterEnroll(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await useAuthStore.getState().loadProfile({ force: true });
      const latest = useAuthStore.getState();
      if (latest.profile?.mfa_reenrollment_required) {
        setError("Authenticator was verified, but re-enrollment is still marked incomplete. Try Continue again.");
        return;
      }
      navigate(
        getAuthenticatedEntryPath({
          isAdmin: latest.isAdmin,
          isOnboarded: resolveOnboardingCompletedForRedirect({
            profile: latest.profile,
            isProfileLoaded: latest.isProfileLoaded,
          }),
          preferredReturnTo,
        }),
        preferredReturnTo
          ? { replace: true, state: { from: preferredReturnTo } }
          : { replace: true },
      );
    } finally {
      setBusy(false);
    }
  }

  if (authStatus !== "authenticated") {
    return (
      <AuthShell>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Sign in required</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your password first, then set up a new authenticator.
          </p>
          <Link
            to={`/login?returnTo=${encodeURIComponent(AUTH_PATHS.mfaEnroll)}`}
            className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (recoveryCodes) {
    return (
      <AuthShell>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Authenticator enabled</h1>
          <p className="text-sm text-muted-foreground">
            Store these one-time recovery codes somewhere safe. Each code works once. We cannot show them again.
          </p>
          {recoveryCodes.length > 0 ? (
            <ul className="font-mono text-sm rounded-xl border border-border bg-card px-4 py-3 space-y-1">
              {recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              You can generate recovery codes later from Settings → Security.
            </p>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <Button
            type="button"
            variant="primary"
            fullWidth
            loading={busy}
            onClick={() => void continueAfterEnroll()}
          >
            Continue
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Set up a new authenticator</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Your previous authenticator was removed after recovery. Scan a new QR code, then enter the 6-digit code.
          Email codes cannot replace this step.
        </p>
        {error && (
          <div role="alert" className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {!qrCode ? (
          <Button type="button" variant="primary" fullWidth loading={busy} onClick={() => void startEnroll()}>
            Show QR code
          </Button>
        ) : (
          <>
            <img src={qrCode} alt="Authenticator QR code" className="w-40 h-40 rounded-lg border border-border" />
            <Input
              label="Authenticator code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <Button
              type="button"
              variant="primary"
              fullWidth
              loading={busy}
              disabled={code.length < 6}
              onClick={() => void verifyEnroll()}
            >
              Verify new authenticator
            </Button>
          </>
        )}
      </div>
    </AuthShell>
  );
}
