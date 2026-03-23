// @ts-nocheck -- retained: notification_prefs and privacy_prefs JSONB column types not in Supabase generated schema; Toggle component uses Radix UI checked prop which TypeScript does not accept on the wrapper component type.
import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { CheckCircle, Bell, Mail, Smartphone } from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// SettingsNotifications
// ─────────────────────────────────────────────────────────────────

const NOTIFICATION_GROUPS = [
  {
    label: "Session reminders",
    items: [
      { key: "session_reminder_email",  label: "Email reminder before scheduled interview", channel: "email" },
      { key: "session_reminder_push",   label: "Push notification 30 min before interview",  channel: "push"  },
    ],
  },
  {
    label: "Progress updates",
    items: [
      { key: "weekly_report_email",     label: "Weekly performance digest (email)",           channel: "email" },
      { key: "streak_reminder_push",    label: "Daily practice streak reminder",              channel: "push"  },
      { key: "milestone_push",          label: "Achievement & milestone notifications",        channel: "push"  },
    ],
  },
  {
    label: "AI & credits",
    items: [
      { key: "low_credits_email",       label: "Alert when credits are running low",          channel: "email" },
      { key: "debrief_ready_push",      label: "Notify when AI debrief is ready",             channel: "push"  },
    ],
  },
  {
    label: "Community",
    items: [
      { key: "room_invite_push",        label: "Peer practice room invitations",              channel: "push"  },
      { key: "product_updates_email",   label: "Product updates and new features",            channel: "email" },
    ],
  },
];

export default function SettingsNotifications() {
  const { profile, user } = useAuthStore();

  const [prefs,   setPrefs]   = useState<Record<string, boolean>>(
    profile?.notification_prefs ?? {}
  );
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  function toggle(key: string) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ notification_prefs: prefs })
        .eq("id", user.id);
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(err?.message ?? "Failed to save notification preferences.");
    } finally {
      setSaving(false);
    }
  }

  const channelIcon = (ch: string) =>
    ch === "email"
      ? <Mail className="w-3 h-3 text-muted-foreground" />
      : <Smartphone className="w-3 h-3 text-muted-foreground" />;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Notifications</h2>

      {NOTIFICATION_GROUPS.map((group) => (
        <Card key={group.label}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            {group.label}
          </h3>
          <div className="space-y-4">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {channelIcon(item.channel)}
                  <span className="text-sm text-foreground">{item.label}</span>
                </div>
                <Toggle
                  checked={prefs[item.key] ?? false}
                  onChange={() => toggle(item.key)}
                />
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Button
        variant={saved ? "success" : "primary"}
        size="md"
        loading={saving}
        onClick={handleSave}
        leftIcon={saved ? <CheckCircle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      >
        {saved ? "Saved!" : "Save preferences"}
      </Button>
    </div>
  );
}
