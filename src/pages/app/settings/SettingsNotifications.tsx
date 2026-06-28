// @ts-nocheck
import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { CheckCircle, Bell, Mail, Smartphone, Send } from "lucide-react";
import { toast } from "sonner";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";

type DigestFrequency = "daily" | "weekly" | "off";

type NotificationPrefs = {
  session_complete?: boolean;
  credit_low?: boolean;
  product_updates?: boolean;
  practice_reminders?: boolean;
  debrief_ready?: boolean;
  digest_frequency?: DigestFrequency;
};

const CATEGORY_ITEMS: Array<{
  key: keyof NotificationPrefs;
  label: string;
  channel: "email" | "push";
}> = [
  { key: "session_complete", label: "Session completed summaries", channel: "email" },
  { key: "debrief_ready", label: "Debrief ready notifications", channel: "email" },
  { key: "credit_low", label: "Low credit warnings", channel: "email" },
  { key: "practice_reminders", label: "Practice reminders", channel: "push" },
  { key: "product_updates", label: "Product updates", channel: "email" },
];

const DIGEST_OPTIONS: { value: DigestFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "off", label: "Off" },
];

function readPrefs(profile: unknown): NotificationPrefs {
  const raw = (profile as { notification_prefs?: NotificationPrefs | null })?.notification_prefs;
  return {
    session_complete: raw?.session_complete ?? true,
    credit_low: raw?.credit_low ?? true,
    product_updates: raw?.product_updates ?? false,
    practice_reminders: raw?.practice_reminders ?? true,
    debrief_ready: raw?.debrief_ready ?? true,
    digest_frequency: raw?.digest_frequency ?? "weekly",
  };
}

export default function SettingsNotifications() {
  const { profile, user } = useAuthStore();

  const [prefs, setPrefs] = useState<NotificationPrefs>(() => readPrefs(profile));
  const [emailNotifications, setEmailNotifications] = useState(
    (profile as any)?.email_notifications ?? true,
  );
  const [sessionReminders, setSessionReminders] = useState(
    (profile as any)?.session_reminders ?? true,
  );
  const [marketingEmails, setMarketingEmails] = useState(
    (profile as any)?.marketing_emails ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleCategory(key: keyof NotificationPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  function setDigest(value: DigestFrequency) {
    setPrefs((p) => ({ ...p, digest_frequency: value }));
  }

  function unsubscribeAll() {
    setEmailNotifications(false);
    setSessionReminders(false);
    setMarketingEmails(false);
    setPrefs({
      session_complete: false,
      credit_low: false,
      product_updates: false,
      practice_reminders: false,
      debrief_ready: false,
      digest_frequency: "off",
    });
    toast.message("All notifications turned off — save to apply.");
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          email_notifications: emailNotifications,
          session_reminders: sessionReminders,
          marketing_emails: marketingEmails,
          notification_prefs: prefs,
          updated_at: new Date().toISOString(),
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

  function sendTestNotification() {
    toast.success("Test notification", {
      description: "If notifications are enabled, you'll receive alerts like this.",
    });
  }

  const channelIcon = (ch: string) =>
    ch === "email"
      ? <Mail className="w-3 h-3 text-muted-foreground" />
      : <Smartphone className="w-3 h-3 text-muted-foreground" />;

  return (
    <SettingsPageShell title="Notifications">

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-3">Global</h3>
        <div className="space-y-4">
          {[
            { label: "Email notifications (master)", checked: emailNotifications, onChange: setEmailNotifications },
            { label: "Session reminders", checked: sessionReminders, onChange: setSessionReminders },
            { label: "Marketing emails", checked: marketingEmails, onChange: setMarketingEmails },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-sm text-foreground">{item.label}</span>
              <Toggle checked={item.checked} onChange={() => item.onChange(!item.checked)} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-3">Categories</h3>
        <div className="space-y-4">
          {CATEGORY_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {channelIcon(item.channel)}
                <span className="text-sm text-foreground">{item.label}</span>
              </div>
              <Toggle
                checked={Boolean(prefs[item.key])}
                onChange={() => toggleCategory(item.key)}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-3">Email digest</h3>
        <div className="flex flex-wrap gap-2">
          {DIGEST_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDigest(opt.value)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                prefs.digest_frequency === opt.value
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={saved ? "success" : "primary"}
          size="md"
          loading={saving}
          onClick={handleSave}
          leftIcon={saved ? <CheckCircle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        >
          {saved ? "Saved!" : "Save preferences"}
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={sendTestNotification}
          leftIcon={<Send className="w-4 h-4" />}
        >
          Send test notification
        </Button>
        <Button variant="ghost" size="md" onClick={unsubscribeAll}>
          Unsubscribe all
        </Button>
      </div>
    </SettingsPageShell>
  );
}
