// @ts-nocheck
import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { CheckCircle, Bell, Mail, Smartphone } from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// SettingsNotifications — uses actual profile columns
// ─────────────────────────────────────────────────────────────────

const NOTIFICATION_ITEMS = [
  { key: "email_notifications",  label: "Email notifications",                    channel: "email" },
  { key: "session_reminders",    label: "Session reminder notifications",          channel: "push"  },
  { key: "marketing_emails",     label: "Product updates and marketing emails",    channel: "email" },
];

export default function SettingsNotifications() {
  const { profile, user } = useAuthStore();

  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    email_notifications: (profile as any)?.email_notifications ?? true,
    session_reminders:   (profile as any)?.session_reminders   ?? true,
    marketing_emails:    (profile as any)?.marketing_emails    ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  function toggle(key: string) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          email_notifications: prefs.email_notifications,
          session_reminders:   prefs.session_reminders,
          marketing_emails:    prefs.marketing_emails,
          updated_at:          new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Notification preferences saved");
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

      <Card>
        <div className="space-y-4">
          {NOTIFICATION_ITEMS.map((item) => (
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
