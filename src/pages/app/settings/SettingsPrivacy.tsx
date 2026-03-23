// @ts-nocheck -- retained: notification_prefs and privacy_prefs JSONB column types not in Supabase generated schema; Toggle component uses Radix UI checked prop which TypeScript does not accept on the wrapper component type.
import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle, Shield, Eye, Database, Lock } from "lucide-react";
import { toast } from "sonner";

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
        desc:  "Help improve our AI models with anonymised session transcripts.",
      },
      {
        key:   "store_transcripts",
        label: "Store session transcripts",
        desc:  "Keep full transcripts for review. Disable to auto-delete after analysis.",
      },
      {
        key:   "analytics_tracking",
        label: "Product analytics",
        desc:  "Allow anonymous usage analytics to improve the product.",
      },
    ],
  },
  {
    group: "Visibility",
    items: [
      {
        key:   "public_profile",
        label: "Public profile",
        desc:  "Allow your profile to appear in leaderboards and community features.",
      },
      {
        key:   "share_scorecard",
        label: "Allow scorecard sharing",
        desc:  "Enable the ability to generate public share links for scorecards.",
      },
    ],
  },
  {
    group: "Security",
    items: [
      {
        key:   "login_notifications",
        label: "Email on new login",
        desc:  "Receive an email when a new device logs in to your account.",
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(err?.message ?? "Failed to save privacy settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Privacy</h2>

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
    </div>
  );
}
