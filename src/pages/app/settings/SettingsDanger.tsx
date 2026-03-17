import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import {
  Trash2, Download, AlertTriangle,
  LogOut, RefreshCw,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// SettingsDanger — delete account, export data, reset
// ─────────────────────────────────────────────────────────────────

export default function SettingsDanger() {
  const navigate    = useNavigate();
  const { user, signOut } = useAuthStore();

  const [deleteOpen,  setDeleteOpen]  = useState(false);
  const [resetOpen,   setResetOpen]   = useState(false);
  const [confirm,     setConfirm]     = useState("");
  const [deleting,    setDeleting]    = useState(false);
  const [resetting,   setResetting]   = useState(false);
  const [exporting,   setExporting]   = useState(false);

  // ── Export data ──────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
    const res = await fetch(`${EDGE_BASE}/export-user-data`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ user_id: user?.id }),
    });

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `confideq-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  // ── Reset progress ───────────────────────────────────────────

  async function handleReset() {
    if (!user) return;
    setResetting(true);
    await supabase.from("sessions").delete().eq("user_id", user.id);
    await supabase.from("session_answers").delete().eq("user_id", user.id);
    await supabase.from("answer_bank").delete().eq("user_id", user.id);
    setResetting(false);
    setResetOpen(false);
    navigate("/app/dashboard");
  }

  // ── Delete account ───────────────────────────────────────────

  async function handleDelete() {
    if (!user || confirm !== user.email) return;
    setDeleting(true);
    const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
    await fetch(`${EDGE_BASE}/delete-account`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ user_id: user.id }),
    });
    await signOut();
    navigate("/");
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white">Danger zone</h2>

      {/* Export */}
      <Card className="flex items-start gap-4 border-blue-500/15">
        <Download className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Export your data</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
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
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            Delete all sessions, answers, and analytics. Your account and
            subscription remain intact.
          </p>
          <Button
            variant="warning"
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
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            Permanently delete your account and all data. This cannot be undone.
            Your subscription will be cancelled immediately.
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
            variant="warning"
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
        onClose={() => { setDeleteOpen(false); setConfirm(""); }}
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
        <div className="mb-5">
          <p className="text-xs text-gray-400 mb-1.5">
            Type your email <span className="text-white font-mono">{user?.email}</span> to confirm
          </p>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={user?.email ?? "your@email.com"}
          />
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => { setDeleteOpen(false); setConfirm(""); }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            fullWidth
            loading={deleting}
            disabled={confirm !== user?.email}
            onClick={handleDelete}
          >
            Delete account
          </Button>
        </div>
      </Modal>
    </div>
  );
}
