import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Shield, Lock, Smartphone, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  MFA_TOTP_FRIENDLY_NAME,
  collectMfaFactors,
  findUnverifiedTotp,
  findVerifiedTotp,
  isFriendlyNameConflictError,
  type ListedMfaFactor,
} from "@/lib/auth/mfaFactors";
import { getPasswordStrength, validatePassword } from "@/lib/validators/emailValidator";

type MfaUiState =
  | "NOT_CONFIGURED"
  | "ENROLLING"
  | "PENDING_VERIFICATION"
  | "ENABLED";

function deriveMfaUiState(
  verifiedTotp: ListedMfaFactor | undefined,
  unverifiedTotp: ListedMfaFactor[],
  enrollingQr: boolean,
  enrollFactorId: string | null,
): MfaUiState {
  if (verifiedTotp) return "ENABLED";
  if (enrollFactorId) return "PENDING_VERIFICATION";
  if (enrollingQr || unverifiedTotp.length > 0) return "ENROLLING";
  return "NOT_CONFIGURED";
}
import { agentDebugIngest } from "@/lib/debug/agentIngest";
import { debugLog161d95 } from "@/lib/debug/debugLog161d95";

export default function SettingsSecurity() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const [factors, setFactors] = useState<ListedMfaFactor[]>([]);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function loadFactors(): Promise<ListedMfaFactor[]> {
    setMfaLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const all = collectMfaFactors(data);
      setFactors(all);
      // #region agent log
      debugLog161d95({
        hypothesisId: "H6",
        location: "SettingsSecurity.tsx:loadFactors",
        message: "mfa_factors_loaded",
        data: {
          total: all.length,
          verified: all.filter((f) => f.factor_type === "totp" && f.status === "verified").length,
          unverified: all.filter((f) => f.factor_type === "totp" && f.status === "unverified").length,
          statuses: all.map((f) => ({ type: f.factor_type, status: f.status })),
        },
      });
      // #endregion
      return all;
    } catch (err) {
      console.warn("[SettingsSecurity] MFA list:", err);
      setFactors([]);
      return [];
    } finally {
      setMfaLoading(false);
    }
  }

  useEffect(() => {
    void loadFactors();
  }, []);

  const verifiedTotp = findVerifiedTotp(factors);
  const unverifiedTotp = findUnverifiedTotp(factors);
  const mfaUiState = deriveMfaUiState(
    verifiedTotp,
    unverifiedTotp,
    enrolling,
    enrollFactorId,
  );

  async function clearUnverifiedTotpFactors(list: ListedMfaFactor[]): Promise<number> {
    const stale = findUnverifiedTotp(list);
    let removed = 0;
    for (const factor of stale) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (!error) removed += 1;
      else console.warn("[SettingsSecurity] Failed to clear unverified MFA factor:", error.message);
    }
    return removed;
  }

  async function handleChangePassword() {
    if (!currentPw) {
      toast.error("Enter your current password.");
      return;
    }
    const basic = validatePassword(newPw);
    if (!basic.valid) {
      toast.error(basic.error ?? "Password is invalid.");
      return;
    }
    const strength = getPasswordStrength(newPw);
    if (
      !strength.isAcceptable ||
      !/[0-9]/.test(newPw) ||
      !/[^a-zA-Z0-9]/.test(newPw) ||
      !/[A-Z]/.test(newPw) ||
      !/[a-z]/.test(newPw)
    ) {
      toast.error(
        strength.feedback[0] ??
          "Password must include uppercase, lowercase, a number, and a special character.",
      );
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const email = session.session?.user.email;
      if (!email) throw new Error("Your session has expired. Please sign in again.");
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPw,
      });
      if (verifyError) throw new Error("Current password is incorrect.");
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      toast.success("Password updated successfully");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update password";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function enrollTotpFactor() {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: MFA_TOTP_FRIENDLY_NAME,
    });
    if (error) throw error;
    return data;
  }

  async function startMfaEnroll() {
    setEnrolling(true);
    setQrCode(null);
    setEnrollFactorId(null);
    try {
      // Stale unverified enrollments reserve the friendly name and block setup (422)
      // while leaving login without an MFA challenge (only verified factors raise AAL2).
      const latest = await loadFactors();
      const alreadyVerified = findVerifiedTotp(latest);
      if (alreadyVerified) {
        toast.message("Authenticator already configured. Use Verify or Disable below.");
        setFactors(latest);
        return;
      }
      const cleared = await clearUnverifiedTotpFactors(latest);
      if (cleared > 0) {
        await loadFactors();
      }

      let data;
      try {
        data = await enrollTotpFactor();
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (!isFriendlyNameConflictError(msg)) throw firstErr;
        const again = await loadFactors();
        await clearUnverifiedTotpFactors(again);
        data = await enrollTotpFactor();
      }

      setQrCode(data.totp?.qr_code ?? null);
      setEnrollFactorId(data.id);
      toast.message("Scan the QR code with your authenticator app, then enter the code below.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Two-factor setup is unavailable. Enable MFA in your Supabase project settings.",
      );
    } finally {
      setEnrolling(false);
    }
  }

  async function verifyMfaEnroll() {
    if (!enrollFactorId || !verifyCode.trim()) return;
    setVerifying(true);
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: enrollFactorId,
      });
      if (chErr) throw chErr;

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challenge.id,
        code: verifyCode.trim(),
      });
      if (vErr) throw vErr;

      toast.success("Two-factor authentication enabled.");
      setQrCode(null);
      setEnrollFactorId(null);
      setVerifyCode("");
      await loadFactors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid verification code");
    } finally {
      setVerifying(false);
    }
  }

  async function unenrollMfa(factorId: string) {
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success("Two-factor authentication removed.");
      setQrCode(null);
      setEnrollFactorId(null);
      await loadFactors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove 2FA");
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Security</h2>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          Change Password
        </h3>
        <div className="space-y-3 max-w-md">
          <div>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor="security-current-pw">
              Current Password
            </label>
            <div className="relative">
              <input
                id="security-current-pw"
                name="current-password"
                autoComplete="current-password"
                type={showCurrentPw ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="Enter current password"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw((v) => !v)}
                aria-label={showCurrentPw ? "Hide current password" : "Show current password"}
                aria-pressed={showCurrentPw}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor="security-new-pw">
              New Password
            </label>
            <div className="relative">
              <input
                id="security-new-pw"
                name="new-password"
                autoComplete="new-password"
                type={showNewPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="8+ chars, number, and special character"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPw((v) => !v)}
                aria-label={showNewPw ? "Hide new password" : "Show new password"}
                aria-pressed={showNewPw}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1" htmlFor="security-confirm-pw">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="security-confirm-pw"
                name="confirm-password"
                autoComplete="new-password"
                type={showConfirmPw ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw((v) => !v)}
                aria-label={showConfirmPw ? "Hide confirm password" : "Show confirm password"}
                aria-pressed={showConfirmPw}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleChangePassword}
            disabled={saving || !newPw || !confirmPw}
            leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          >
            {saving ? "Updating..." : "Update Password"}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Two-Factor Authentication</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Use an authenticator app (Google Authenticator, Authy, etc.) for an extra login step.
              </p>
            </div>
          </div>
          {mfaUiState === "ENABLED" ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-medium">
              Enabled
            </span>
          ) : mfaUiState === "ENROLLING" || mfaUiState === "PENDING_VERIFICATION" ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium">
              Setup incomplete
            </span>
          ) : null}
        </div>

        {mfaLoading ? (
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Checking 2FA status…
          </p>
        ) : mfaUiState === "ENABLED" && verifiedTotp ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void unenrollMfa(verifiedTotp.id)}>
              Disable 2FA
            </Button>
          </div>
        ) : enrollFactorId && qrCode ? (
          <div className="mt-4 space-y-3 max-w-sm">
            <img
              src={qrCode}
              alt="Authenticator QR code"
              className="w-40 h-40 rounded-lg border border-border"
            />
            <input
              type="text"
              inputMode="numeric"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              aria-label="Authenticator verification code"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={verifyCode.length < 6 || verifying}
              onClick={() => void verifyMfaEnroll()}
              leftIcon={verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              Verify and enable
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {unverifiedTotp.length > 0 ? (
              <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                A previous authenticator setup was never finished. Continue to replace it with a new
                QR code — login MFA starts only after you verify the code.
              </p>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={enrolling}
              onClick={() => void startMfaEnroll()}
              leftIcon={enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {unverifiedTotp.length > 0 ? "Continue authenticator setup" : "Set up authenticator app"}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          Active Sessions
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Current Session</p>
              <p className="text-xs text-muted-foreground">This browser · Active now</p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-medium">
              Active
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
