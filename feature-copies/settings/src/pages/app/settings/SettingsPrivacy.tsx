import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/switch";
import { CheckCircle, Shield, Eye, Database, Lock, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { usePrivateMode } from "@/hooks/usePrivateMode";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";
import {
  PRIVACY_ENFORCEMENT,
  parsePrivacyPrefs,
  toStoredPrivacyPrefs,
  applyObservabilityPreferences,
  type PrivacyPrefs,
} from "@/lib/privacy/privacyPrefs";

const PRIVACY_SETTINGS: Array<{
  group: "Data & AI" | "Visibility";
  items: Array<{
    key: keyof PrivacyPrefs;
    label: string;
    desc: string;
  }>;
}> = [
  {
    group: "Data & AI",
    items: [
      {
        key: "allow_ai_training",
        label: "Allow anonymised data for AI improvement",
        desc: "When off, AI Edge calls send x-ai-training-consent: false and session text is omitted from PostHog and Sentry. We do not train models on your sessions unless you opt in.",
      },
      {
        key: "store_transcripts",
        label: "Store session transcripts",
        desc: "When off, transcripts are not written to the cloud. The live overlay transcript still works for the current session. Existing saved transcripts stay until you delete them.",
      },
      {
        key: "analytics_tracking",
        label: "Product analytics",
        desc: "When off, PostHog capturing is opted out in this browser. Applies after you save.",
      },
      {
        key: "crash_reporting",
        label: "Crash reporting",
        desc: "When off, Sentry does not send crash reports from this browser. Applies after you save.",
      },
    ],
  },
  {
    group: "Visibility",
    items: [
      {
        key: "share_scorecard",
        label: "Allow scorecard sharing",
        desc: "When off, public scorecard links cannot be created and the Share button is hidden.",
      },
    ],
  },
];

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Failed to save privacy settings.";
}

export default function SettingsPrivacy() {
  const { profile, updateProfile } = useAuthStore();
  const { enabled: privateMode, toggle: togglePrivateMode } = usePrivateMode();

  const [prefs, setPrefs] = useState<PrivacyPrefs>(() =>
    parsePrivacyPrefs(profile?.privacy_prefs),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrefs(parsePrivacyPrefs(profile?.privacy_prefs));
    applyObservabilityPreferences(parsePrivacyPrefs(profile?.privacy_prefs));
  }, [profile?.privacy_prefs]);

  function toggle(key: keyof PrivacyPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSave() {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const stored = toStoredPrivacyPrefs(prefs);
      await updateProfile({ privacy_prefs: stored });
      applyObservabilityPreferences(stored);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Privacy settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPageShell title="Privacy">

      <Card className="border-primary/20 bg-primary/5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Every setting below is enforced. </span>
          Private mode (separate control) pauses cloud AI immediately. Two-factor enrollment lives under Settings → Security.
        </p>
        <ul className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
          {Object.entries(PRIVACY_ENFORCEMENT).map(([key, row]) => (
            <li key={key}>
              <span className="font-medium text-foreground">{key}</span>
              {": enforced — "}
              {row.consumer}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="border-primary/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <WifiOff className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Private mode</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-md">
                Pauses cloud AI requests and analysis while enabled. Use on shared devices
                or when you do not want session data sent to Edge Functions.
              </p>
            </div>
          </div>
          <Switch checked={privateMode} onCheckedChange={togglePrivateMode} />
        </div>
      </Card>

      {PRIVACY_SETTINGS.map((group) => (
        <Card key={group.group}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
            {group.group === "Data & AI" && <Database className="w-3.5 h-3.5" />}
            {group.group === "Visibility" && <Eye className="w-3.5 h-3.5" />}
            {group.group}
          </h3>
          <div className="space-y-5">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
                <Switch
                  checked={prefs[item.key]}
                  onCheckedChange={() => toggle(item.key)}
                  aria-label={item.label}
                />
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          Security
        </h3>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-foreground">Two-factor authentication</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Enrollment and recovery live under Settings → Security. This page does not store a 2FA toggle.
            </p>
          </div>
          <Link
            to="/app/settings/security"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Open Security
          </Link>
        </div>
      </Card>

      <Card className="flex items-start gap-3 border-blue-500/15 bg-blue-500/3">
        <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Under GDPR and CCPA you have the right to access, correct, or delete your
          personal data at any time. Visit{" "}
          <a href="/privacy" className="text-blue-400 underline" target="_blank" rel="noreferrer">
            our privacy policy
          </a>{" "}
          for full details.
        </p>
      </Card>

      <Button
        variant={saved ? "success" : "primary"}
        size="md"
        loading={saving}
        onClick={() => void handleSave()}
        leftIcon={saved ? <CheckCircle className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
      >
        {saved ? "Saved!" : "Save privacy settings"}
      </Button>
    </SettingsPageShell>
  );
}
