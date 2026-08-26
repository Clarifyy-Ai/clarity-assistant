// @ts-nocheck
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/userStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/switch";
import { CheckCircle, Bell, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";

type NotificationPrefs = {
  session_complete?: boolean;
  credit_low?: boolean;
  product_updates?: boolean;
  debrief_ready?: boolean;
};

const CATEGORY_ITEMS: Array<{
  key: keyof NotificationPrefs;
  label: string;
}> = [
  { key: "session_complete", label: "Session completed summaries" },
  { key: "debrief_ready", label: "Debrief ready notifications" },
  { key: "credit_low", label: "Low credit warnings" },
  { key: "product_updates", label: "Product updates" },
];

function readPrefs(profile: unknown): NotificationPrefs {
  const raw = (profile as { notification_prefs?: NotificationPrefs | null })?.notification_prefs;
  return {
    session_complete: raw?.session_complete ?? true,
    credit_low: raw?.credit_low ?? true,
    product_updates: raw?.product_updates ?? false,
    debrief_ready: raw?.debrief_ready ?? true,
  };
}

export default function SettingsNotifications() {
  const { profile, user, updateProfile } = useAuthStore();

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
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setPrefs(readPrefs(profile));
    setEmailNotifications(profile.email_notifications ?? true);
    setSessionReminders(profile.session_reminders ?? true);
    setMarketingEmails(profile.marketing_emails ?? false);
  }, [
    profile?.id,
    profile?.notification_prefs,
    profile?.email_notifications,
    profile?.session_reminders,
    profile?.marketing_emails,
  ]);

  function toggleCategory(key: keyof NotificationPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  function unsubscribeAll() {
    setEmailNotifications(false);
    setSessionReminders(false);
    setMarketingEmails(false);
    setPrefs({
      session_complete: false,
      credit_low: false,
      product_updates: false,
      debrief_ready: false,
    });
    toast.message("All notifications turned off — save to apply.");
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    setSaveFailed(false);
    try {
      await updateProfile({
        email_notifications: emailNotifications,
        session_reminders: sessionReminders,
        marketing_emails: marketingEmails,
        notification_prefs: prefs,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Notification preferences saved");
    } catch (err) {
      setSaveFailed(true);
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

  return (
    <SettingsPageShell title="Notifications">

      <Card className="border-amber-500/20 bg-amber-500/5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Email enforcement: </span>
          Category toggles and the master email switch are checked by the{" "}
          <code className="text-[11px]">send-email</code> edge function before Resend sends.
          Push reminders and email digests are <span className="font-medium text-foreground">coming soon</span>.
        </p>
      </Card>

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
              <Switch
                checked={item.checked}
                onCheckedChange={(v) => item.onChange(v)}
                aria-label={item.label}
              />
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
                <Mail className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm text-foreground">{item.label}</span>
              </div>
              <Switch
                checked={Boolean(prefs[item.key])}
                onCheckedChange={() => toggleCategory(item.key)}
                aria-label={item.label}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-foreground">Push &amp; digest</h3>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
            Coming soon
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Push reminders and scheduled email digests are not available yet. In-app toasts and browser notifications (when permitted) are the only real-time alerts; email covers the categories above.
        </p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={saved ? "success" : saveFailed ? "danger" : "primary"}
          size="md"
          loading={saving}
          onClick={handleSave}
          leftIcon={saved ? <CheckCircle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        >
          {saving ? "Saving…" : saved ? "Saved!" : saveFailed ? "Failed — retry" : "Save preferences"}
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
