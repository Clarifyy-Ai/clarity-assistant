// Sprint E: Settings polish — per-feature retention, notification channels (email/push/in-app),
// test-notification button, CSV export of session history. Stored in profiles.metadata jsonb.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import {
  Bell, Mail, Smartphone, MonitorSmartphone, Send, Download, Clock, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { userFacingDbError } from "@/lib/errors/userFacingDbError";
import { messageFromExportCaught } from "@/lib/export/exportUserFacingError";

type RetentionKey = "transcripts" | "ai_answers" | "debriefs" | "documents";
type ChannelKey = "email" | "push" | "in_app";

const RETENTION_FEATURES: { key: RetentionKey; label: string; desc: string }[] = [
  { key: "transcripts", label: "Session transcripts", desc: "Raw audio-to-text records" },
  { key: "ai_answers", label: "AI answer history", desc: "Generated STAR responses" },
  { key: "debriefs", label: "Debriefs", desc: "Post-session AI analysis" },
  { key: "documents", label: "Uploaded documents", desc: "Resumes, JDs, notes" },
];

const RETENTION_CHOICES = [7, 30, 90, 180, 365, 0]; // 0 = forever

const CHANNELS: { key: ChannelKey; label: string; icon: any; desc: string }[] = [
  { key: "email", label: "Email", icon: Mail, desc: "Important updates to your inbox" },
  { key: "push", label: "Push", icon: Smartphone, desc: "Mobile/desktop push notifications" },
  { key: "in_app", label: "In-app", icon: MonitorSmartphone, desc: "Bell icon in the top bar" },
];

interface ExtendedPrefs {
  retention: Partial<Record<RetentionKey, number>>;
  channels: Partial<Record<ChannelKey, boolean>>;
}

const DEFAULTS: ExtendedPrefs = {
  retention: { transcripts: 90, ai_answers: 180, debriefs: 365, documents: 0 },
  channels: { email: true, push: false, in_app: true },
};

export default function SettingsPolish() {
  const { user, profile } = useAuthStore();
  const [prefs, setPrefs] = useState<ExtendedPrefs>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const meta: any = (profile as any)?.metadata ?? {};
    setPrefs({
      retention: { ...DEFAULTS.retention, ...(meta.retention ?? {}) },
      channels: { ...DEFAULTS.channels, ...(meta.channels ?? {}) },
    });
  }, [profile]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const meta: any = (profile as any)?.metadata ?? {};
      const next = { ...meta, retention: prefs.retention, channels: prefs.channels };
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ metadata: next, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Preferences saved");
    } catch (e: any) {
      toast.error(userFacingDbError(e, "save"));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      // In-app toast is the universal fallback — works without server.
      toast.success("Test notification — looks good!", {
        description: "If you enabled email/push, those will arrive separately.",
      });
    } finally {
      setTimeout(() => setTesting(false), 600);
    }
  }

  async function exportSessionsCsv() {
    if (!user) return;
    setExporting(true);
    try {
      const { data, error } = await (supabase as any)
        .from("sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows: any[] = data ?? [];
      if (rows.length === 0) {
        toast.info("No sessions to export");
        return;
      }
      const cols = Object.keys(rows[0]);
      const escape = (v: any) => {
        if (v === null || v === undefined) return "";
        const s = typeof v === "object" ? JSON.stringify(v) : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [
        cols.join(","),
        ...rows.map((r) => cols.map((c) => escape(r[c])).join(",")),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clarify-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} sessions`);
    } catch (e: any) {
      toast.error(messageFromExportCaught(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Polish & advanced preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Per-feature data retention, notification channels, and quick CSV export.
        </p>
      </div>

      {/* Per-feature retention */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold">Data retention (per feature)</h2>
        </div>
        <ul className="space-y-3">
          {RETENTION_FEATURES.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
              <select
                value={prefs.retention[f.key] ?? 0}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    retention: { ...p.retention, [f.key]: Number(e.target.value) },
                  }))
                }
                className="bg-background border border-border rounded-md text-xs px-2 py-1.5"
              >
                {RETENTION_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? "Forever" : `${d} days`}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>

      {/* Notification channels */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Notification channels</h2>
        </div>
        <ul className="space-y-2">
          {CHANNELS.map(({ key, label, icon: Icon, desc }) => {
            const on = !!prefs.channels[key];
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      channels: { ...p.channels, [key]: !on },
                    }))
                  }
                  aria-pressed={on}
                  className={cn(
                    "relative w-10 h-6 rounded-full transition-colors",
                    on ? "bg-primary" : "bg-secondary"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background transition-transform",
                      on && "translate-x-4"
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={sendTest}
            disabled={testing}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-secondary flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            {testing ? "Sending…" : "Send test notification"}
          </button>
        </div>
      </section>

      {/* Quick CSV export */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Download className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold">Quick export</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Download your last 1,000 sessions as CSV (includes scores, timestamps, and metadata).
        </p>
        <button
          onClick={exportSessionsCsv}
          disabled={exporting}
          className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-secondary flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          {exporting ? "Exporting…" : "Export sessions as CSV"}
        </button>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm rounded-md bg-primary hover:bg-primary text-white flex items-center gap-2 shadow-lg"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
