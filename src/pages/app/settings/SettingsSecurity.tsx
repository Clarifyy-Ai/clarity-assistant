import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Shield, Lock, Smartphone, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface MfaFactor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
}

export default function SettingsSecurity() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function loadFactors() {
    setMfaLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const all = [...(data?.totp ?? []), ...(data?.phone ?? [])] as MfaFactor[];
      setFactors(all);
    } catch (err) {
      console.warn("[SettingsSecurity] MFA list:", err);
      setFactors([]);
    } finally {
      setMfaLoading(false);
    }
  }

  useEffect(() => {
    void loadFactors();
  }, []);

  const verifiedTotp = factors.find((f) => f.factor_type === "totp" && f.status === "verified");

  async function handleChangePassword() {
    if (!currentPw) {
      toast.error("Enter your current password.");
      return;
    }
    if (!newPw || newPw.length < 8) {
      toast.error("Password must be at least 8 characters.");
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

  async function startMfaEnroll() {
    setEnrolling(true);
    setQrCode(null);
    setEnrollFactorId(null);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
      });
      if (error) throw error;
      setQrCode(data.totp?.qr_code ?? null);
      setEnrollFactorId(data.id);
      toast.message("Scan the QR code with your authenticator app, then enter the code below.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Two-factor setup is unavailable. Enable MFA in your Supabase project settings."
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
                placeholder="At least 8 characters"
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
          {verifiedTotp ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-medium">
              Enabled
            </span>
          ) : null}
        </div>

        {mfaLoading ? (
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Checking 2FA status…
          </p>
        ) : verifiedTotp ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => unenrollMfa(verifiedTotp.id)}
            >
              Disable 2FA
            </Button>
          </div>
        ) : enrollFactorId && qrCode ? (
          <div className="mt-4 space-y-3 max-w-sm">
            <img src={qrCode} alt="Authenticator QR code" className="w-40 h-40 rounded-lg border border-border" />
            <input
              type="text"
              inputMode="numeric"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={verifyCode.length < 6 || verifying}
              onClick={verifyMfaEnroll}
              leftIcon={verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              Verify and enable
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            disabled={enrolling}
            onClick={startMfaEnroll}
            leftIcon={enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
          >
            Set up authenticator app
          </Button>
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
