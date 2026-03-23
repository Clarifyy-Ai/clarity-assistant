import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Shield, Lock, Smartphone, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function SettingsSecurity() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleChangePassword() {
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
            <label className="block text-xs text-muted-foreground mb-1">Current Password</label>
            <input
              type={showPw ? "text" : "password"}
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Enter current password"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">New Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Confirm New Password</label>
            <input
              type={showPw ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Two-Factor Authentication</h3>
              <p className="text-xs text-muted-foreground">Add an extra layer of security to your account</p>
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-medium">
            Coming soon
          </span>
        </div>
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
