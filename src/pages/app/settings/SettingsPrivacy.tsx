// @ts-nocheck -- retained: notification_prefs and privacy_prefs JSONB column types not in Supabase generated schema; Toggle component uses Radix UI checked prop which TypeScript does not accept on the wrapper component type.
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle, Shield, Eye, Database, Lock, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { usePrivateMode } from "@/hooks/usePrivateMode";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";
import posthog from "posthog-js";

function applyAnalyticsPreference(enabled: boolean) {
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  try {
    if (enabled) {
      posthog.opt_in_capturing();
    } else {
      posthog.opt_out_capturing();
    }
  } catch {
    // PostHog may be unavailable
  }
}

// ─────────────────────────────────────────────────────────────────
// SettingsPrivacy
// ─────────────────────────────────────────────────────────────────

const PRIVACY_SETTINGS = [
  {
    group: "Data & AI",
    items: [
      {
        key:   "allow_ai_training",
        label: "Allow anonymised data for AI improvement",
        desc:  "Preference stored — not yet enforced server-side. We do not currently train on your sessions for model improvement.",
      },
      {
        key:   "store_transcripts",
        label: "Store session transcripts",
        desc:  "Preference stored — auto-delete after analysis is not fully wired yet. Existing sessions remain until you delete them.",
      },
      {
        key:   "analytics_tracking",
        label: "Product analytics",
        desc:  "When off, PostHog capturing is opted out in this browser. Applies after you save.",
      },
    ],
  },
  {
    group: "Visibility",
    items: [
      {
        key:   "public_profile",
        label: "Public profile",
        desc:  "Preference stored — leaderboards/community are not live yet, so this has no effect today.",
      },
      {
        key:   "share_scorecard",
        label: "Allow scorecard sharing",
        desc:  "Preference stored — public scorecard links are not fully enforced yet.",
      },
    ],
  },
  {
    group: "Security",
    items: [
      {
        key:   "login_notifications",
        label: "Email on new login",
        desc:  "Preference stored — login alert emails are not yet wired.",
      },
      {
        key:   "two_factor",
        label: "Two-factor authentication",
        desc:  "Add an extra layer of security to your account.",
        badge: "Soon",
        disabled: true,
      },
    ],
  },
];

export default function SettingsPrivacy() {
  const { user, profile } = useAuthStore();
  const { enabled: privateMode, toggle: togglePrivateMode } = usePrivateMode();

  const [prefs,  setPrefs]  = useState<Record<string, boolean>>(
    profile?.privacy_prefs ?? {
      allow_ai_training:  true,
      store_transcripts:  true,
      analytics_tracking: true,
      public_profile:     false,
      share_scorecard:    true,
      login_notifications:true,
    }
  );
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    applyAnalyticsPreference(Boolean(prefs.analytics_tracking));
  }, []); // apply once on mount from loaded prefs

  function toggle(key: string) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ privacy_prefs: prefs })
        .eq("id", user.id);
      if (error) throw error;
      applyAnalyticsPreference(Boolean(prefs.analytics_tracking));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Privacy settings saved");
    } catch (err) {
      toast.error(err?.message ?? "Failed to save privacy settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPageShell title="Privacy">

      <Card className="border-amber-500/20 bg-amber-500/5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Honesty note: </span>
          Product analytics is enforced via PostHog opt-out when saved off. Other toggles are
          stored on your profile; items marked “not yet enforced” do not change backend behaviour yet.
          Private mode (below) does pause cloud AI immediately.
        </p>
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
            {group.group === "Data & AI"  && <Database className="w-3.5 h-3.5" />}
            {group.group === "Visibility" && <Eye      className="w-3.5 h-3.5" />}
            {group.group === "Security"   && <Lock     className="w-3.5 h-3.5" />}
            {group.group}
          </h3>
          <div className="space-y-5">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-foreground">{item.label}</p>
                    {(item as any).badge && (
                      <Badge variant="default" size="sm">{(item as any).badge}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
                <Toggle
                  checked={prefs[item.key] ?? false}
                  onChange={() => !(item as any).disabled && toggle(item.key)}
                  disabled={(item as any).disabled}
                />
              </div>
            ))}
          </div>
        </Card>
      ))}

      {/* GDPR note */}
      <Card className="flex items-start gap-3 border-blue-500/15 bg-blue-500/3">
        <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Under GDPR and CCPA you have the right to access, correct, or delete your
          personal data at any time. Visit{" "}
          <a href="/privacy" className="text-blue-400 underline" target="_blank">
            our privacy policy
          </a>{" "}
          for full details.
        </p>
      </Card>

      <Button
        variant={saved ? "success" : "primary"}
        size="md"
        loading={saving}
        onClick={handleSave}
        leftIcon={saved ? <CheckCircle className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
      >
        {saved ? "Saved!" : "Save privacy settings"}
      </Button>
    </SettingsPageShell>
  );
}
