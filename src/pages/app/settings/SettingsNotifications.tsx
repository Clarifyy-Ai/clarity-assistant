// @ts-nocheck
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/switch";
import { CheckCircle, Bell, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";
import { SettingsSaveBar } from "@/components/settings/SettingsSaveBar";
import { notificationsDB } from "@/lib/supabase/database";
import { mergeNotificationPrefs } from "@/lib/interviews/calendarIntegrationPrefs";
import {
  saveProfileSettings,
  settingsSaveError,
} from "@/lib/settings/saveProfileSettings";
import {
  readNotificationCategoryPrefs,
  readNotificationGlobalPrefs,
  type NotificationCategoryPrefs,
} from "@/lib/settings/notificationPrefs";

const CATEGORY_ITEMS: Array<{
  key: keyof NotificationCategoryPrefs;
  label: string;
}> = [
  { key: "session_complete", label: "Session completed summaries" },
  { key: "debrief_ready", label: "Debrief ready notifications" },
  { key: "credit_low", label: "Low credit warnings" },
  { key: "product_updates", label: "Product updates" },
];

export default function SettingsNotifications() {
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);

  const [prefs, setPrefs] = useState(() => readNotificationCategoryPrefs(profile));
  const [emailNotifications, setEmailNotifications] = useState(
    () => readNotificationGlobalPrefs(profile).email_notifications,
  );
  const [sessionReminders, setSessionReminders] = useState(
    () => readNotificationGlobalPrefs(profile).session_reminders,
  );
  const [marketingEmails, setMarketingEmails] = useState(
    () => readNotificationGlobalPrefs(profile).marketing_emails,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // Rehydrate from auth profile after login/refresh (BOOT now includes these columns).
  const prefsKey = JSON.stringify(profile?.notification_prefs ?? null);
  useEffect(() => {
    if (!profile) return;
    setPrefs(readNotificationCategoryPrefs(profile));
    const global = readNotificationGlobalPrefs(profile);
    setEmailNotifications(global.email_notifications);
    setSessionReminders(global.session_reminders);
    setMarketingEmails(global.marketing_emails);
  }, [
    profile?.id,
    prefsKey,
    profile?.email_notifications,
    profile?.session_reminders,
    profile?.marketing_emails,
  ]);

  function toggleCategory(key: keyof NotificationCategoryPrefs, next: boolean) {
    setPrefs((p) => ({ ...p, [key]: next }));
  }

  function unsubscribeAll() {
    const confirmed = window.confirm(
      "Turn off all email and reminder notifications? You can re-enable them later from this page.",
    );
    if (!confirmed) return;
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
      const notification_prefs = mergeNotificationPrefs(
        profile?.notification_prefs,
        prefs,
      );
      await saveProfileSettings({
        email_notifications: emailNotifications,
        session_reminders: sessionReminders,
        marketing_emails: marketingEmails,
        notification_prefs,
      });
      // Keep local form aligned with what we persisted (including nested merges).
      setPrefs(readNotificationCategoryPrefs({ notification_prefs }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Notification preferences saved");
    } catch (err) {
      setSaveFailed(true);
      toast.error(settingsSaveError(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendTestNotification() {
    if (!user) return;
    try {
      await notificationsDB.createOwn(
        "Test notification",
        "In-app alerts are working. Push delivery is not configured on this environment.",
      );
      toast.success("Test notification saved", {
        description: "Open Notifications to see it. It persists after refresh.",
      });
    } catch (err) {
      toast.error(settingsSaveError(err));
    }
  }

  return (
    <SettingsPageShell title="Notifications">

      <Card className="border-amber-500/20 bg-amber-500/5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Email enforcement: </span>
          Category toggles and the master email switch are checked by the{" "}
          <code className="text-[11px]">send-email</code> edge function before Hostinger Mail (or Resend fallback) sends.
          Push delivery is <span className="font-medium text-foreground">Not configured</span> (no VAPID keys).
          Email send uses Hostinger when configured on the server; otherwise Resend if that secret is present.
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
                onCheckedChange={(v) => toggleCategory(item.key, v)}
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
            Not configured
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Preferences on this page are saved to your account. Push subscriptions require VAPID secrets that are not configured. Scheduled email digests require Hostinger Mail or Resend; in-app notifications and category email gates are the live channels.
        </p>
      </Card>

      <SettingsSaveBar>
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
      </SettingsSaveBar>
    </SettingsPageShell>
  );
}
