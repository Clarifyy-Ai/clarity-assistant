// @ts-nocheck -- retained: Supabase RPC / table types not in generated schema
import { fetchEdge } from "@/lib/network/fetchEdge";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import {
  answerBankDB,
  sessionAnswersDB,
  sessionsDB,
} from "@/lib/supabase/database";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import {
  Trash2, Download, AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";
import { isTerminalDeletionStatus } from "@/lib/account/deletionStates";

// ─────────────────────────────────────────────────────────────────
// SettingsDanger — delete account, export data, reset
// ─────────────────────────────────────────────────────────────────

export default function SettingsDanger() {
  const navigate    = useNavigate();
  const { user, signOut } = useAuthStore();

  const [deleteOpen,  setDeleteOpen]  = useState(false);
  const [resetOpen,   setResetOpen]   = useState(false);
  const [confirm,     setConfirm]     = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [usePasswordConfirm, setUsePasswordConfirm] = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [resetting,   setResetting]   = useState(false);
  const [exporting,   setExporting]   = useState(false);

  // ── Export data ──────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    try {
      
      const res = await fetchEdge("export-user-data", { type: "full" });

      if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `clarify-ai-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded successfully");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed. Please try again.";
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }

  // ── Reset progress ───────────────────────────────────────────

  async function handleReset() {
    if (!user) return;
    setResetting(true);
    try {
      await Promise.all([
        sessionsDB.deleteAllByUserId(user.id),
        sessionAnswersDB.deleteAllByUserId(user.id),
        answerBankDB.deleteAllByUserId(user.id),
      ]);

      toast.success("Progress reset successfully");
      setResetOpen(false);
      navigate("/app/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? "Reset failed. Please try again.";
      toast.error(message);
    } finally {
      setResetting(false);
    }
  }

  // ── Delete account ───────────────────────────────────────────

  function safeDeleteAccountMessage(err: unknown): string {
    const ref =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : `del-${Date.now().toString(36).slice(-8)}`;
    console.error("[SettingsDanger] account deletion failed", { ref, err });
    return `We couldn't delete your account right now. Please try again later or contact support with reference ${ref}.`;
  }

  async function handleDelete() {
    if (!user?.email) return;

    if (usePasswordConfirm) {
      if (!deletePassword.trim()) {
        toast.error("Enter your password to confirm deletion.");
        return;
      }
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });
      if (authErr) {
        toast.error("Incorrect password. Account was not deleted.");
        return;
      }
    } else if (confirm !== user.email) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetchEdge("delete-account", {
        confirmation: usePasswordConfirm ? "DELETE" : confirm,
      });

      if (!res.ok) {
        throw new Error(`delete_failed_${res.status}`);
      }

      const payload = await res.json().catch(() => ({}));
      setDeleteOpen(false);
      if (payload?.status && !isTerminalDeletionStatus(String(payload.status))) {
        toast.success(
          `Account deletion is ${String(payload.status).replaceAll("_", " ")}. We'll finish this in the background.`,
        );
      }
      await signOut();
      navigate("/");
    } catch (err: unknown) {
      toast.error(safeDeleteAccountMessage(err));
      setDeleting(false);
    }
  }

  return (
    <SettingsPageShell title="Danger zone">

      {/* Export */}
      <Card className="flex items-start gap-4 border-blue-500/15">
        <Download className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Export your data</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Download all your sessions, answers, and profile data as JSON.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            loading={exporting}
            onClick={handleExport}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Export data
          </Button>
        </div>
      </Card>

      {/* Reset progress */}
      <Card className="flex items-start gap-4 border-amber-500/15 bg-amber-500/3">
        <RefreshCw className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-300">Reset progress</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Delete all sessions, answers, and analytics. Your account and
            subscription remain intact.
          </p>
          <Button
            variant="danger"
            size="sm"
            className="mt-3"
            onClick={() => setResetOpen(true)}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Reset progress
          </Button>
        </div>
      </Card>

      {/* Delete account */}
      <Card className="flex items-start gap-4 border-red-500/20 bg-red-500/5">
        <Trash2 className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-300">Delete account</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Permanently delete your account and all data. This cannot be undone.
          </p>
          <Button
            variant="danger"
            size="sm"
            className="mt-3"
            onClick={() => setDeleteOpen(true)}
            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Delete my account
          </Button>
        </div>
      </Card>

      {/* Reset confirm modal */}
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset all progress?"
        size="sm"
      >
        <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl mb-5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300 leading-relaxed">
            This will permanently delete all sessions, answers, and streaks.
            Your account remains open.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => setResetOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            loading={resetting}
            onClick={handleReset}
          >
            Yes, reset everything
          </Button>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setConfirm(""); setDeletePassword(""); }}
        title="Delete account permanently?"
        size="sm"
      >
        <div className="flex items-start gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl mb-5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300 leading-relaxed">
            This is irreversible. All data, sessions, and your subscription
            will be permanently deleted.
          </p>
        </div>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setUsePasswordConfirm(false)}
            className={cn(
              "flex-1 text-xs py-2 rounded-lg border transition-colors",
              !usePasswordConfirm
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            Confirm with email
          </button>
          <button
            type="button"
            onClick={() => setUsePasswordConfirm(true)}
            className={cn(
              "flex-1 text-xs py-2 rounded-lg border transition-colors",
              usePasswordConfirm
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            Confirm with password
          </button>
        </div>
        {usePasswordConfirm ? (
          <div className="mb-5">
            <p className="text-xs text-muted-foreground mb-1.5">Enter your account password</p>
            <Input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
            />
          </div>
        ) : (
          <div className="mb-5">
            <p className="text-xs text-muted-foreground mb-1.5">
              Type your email <span className="text-foreground font-mono">{user?.email}</span> to confirm
            </p>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={user?.email ?? "your@email.com"}
            />
          </div>
        )}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => { setDeleteOpen(false); setConfirm(""); setDeletePassword(""); }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            loading={deleting}
            disabled={usePasswordConfirm ? !deletePassword.trim() : confirm !== user?.email}
            onClick={handleDelete}
          >
            Delete account
          </Button>
        </div>
      </Modal>
    </SettingsPageShell>
  );
}
