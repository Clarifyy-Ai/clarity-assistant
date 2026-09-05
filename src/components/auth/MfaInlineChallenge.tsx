import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { verifyTotpChallenge } from "@/lib/auth/mfaFactors";
import { classifyLoginFailure } from "@/lib/auth/loginFailure";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type MfaInlineChallengeProps = {
  factorId: string;
  onVerified: () => void;
  title?: string;
  description?: string;
};

/** Inline TOTP challenge — used on OAuth callback and login without re-entering password. */
export function MfaInlineChallenge({
  factorId,
  onVerified,
  title = "Two-factor authentication",
  description = "Enter the 6-digit code from your authenticator app to finish signing in.",
}: MfaInlineChallengeProps): JSX.Element {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleVerify(): Promise<void> {
    if (code.trim().length < 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyTotpChallenge(supabase.auth.mfa, {
        factorId,
        code,
      });
      await supabase.auth.refreshSession();
      onVerified();
    } catch (err) {
      setError(classifyLoginFailure(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <Input
        label="Authenticator code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        required
      />
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <Button
        type="button"
        variant="primary"
        size="md"
        loading={busy}
        disabled={busy || code.trim().length < 6}
        fullWidth
        onClick={() => void handleVerify()}
      >
        Verify and continue
      </Button>
    </div>
  );
}
