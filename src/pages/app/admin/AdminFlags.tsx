// @ts-nocheck
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Flag, CheckCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// AdminFlags — feature flag management
// ─────────────────────────────────────────────────────────────────

const DEFAULT_FLAGS = [
  { key: "live_copilot",          label: "Live Co-Pilot",            plan: "pro",  desc: "Real-time AI overlay during interviews"       },
  { key: "practice_rooms",        label: "Practice Rooms",           plan: "pro",  desc: "Peer-to-peer and group practice rooms"        },
  { key: "company_research",      label: "Company Research",         plan: "free", desc: "AI-generated company interview briefs"        },
  { key: "analytics_heatmap",     label: "Analytics Heatmap",        plan: "pro",  desc: "GitHub-style activity heatmap"                },
  { key: "ai_panel",              label: "AI Panel Sessions",        plan: "pro",  desc: "3-person AI panel interview mode"             },
  { key: "cover_letter_tool",     label: "Cover Letter Tool",        plan: "pro",  desc: "AI cover letter generation"                   },
  { key: "salary_negotiation",    label: "Salary Negotiation Coach", plan: "pro",  desc: "AI negotiation script generator"             },
  { key: "linkedin_import",       label: "LinkedIn Import",          plan: "free", desc: "Import profile from LinkedIn"                 },
  { key: "referral_program",      label: "Referral Program",         plan: "free", desc: "User referral and rewards system"             },
  { key: "mobile_app",            label: "Mobile App (beta)",        plan: "pro",  desc: "iOS / Android early access"                  },
];

export default function AdminFlags() {
  const [flags,   setFlags]   = useState<Record<string, boolean>>({});
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchFlags(); }, []);

  async function fetchFlags() {
    setLoading(true);
    const { data } = await supabase
      .from("feature_flags")
      .select("key, enabled");

    const map: Record<string, boolean> = {};
    (data ?? []).forEach((f: any) => { map[f.key] = f.enabled; });
    // Fill defaults
    DEFAULT_FLAGS.forEach((f) => {
      if (!(f.key in map)) map[f.key] = true;
    });
    setFlags(map);
    setLoading(false);
  }

  function toggle(key: string) {
    setFlags((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSave() {
    setSaving(true);
    const upserts = Object.entries(flags).map(([key, enabled]) => ({ key, enabled }));
    await supabase.from("feature_flags").upsert(upserts, { onConflict: "key" });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Flag className="w-5 h-5 text-amber-400" />
          Feature Flags
        </h1>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchFlags}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant={saved ? "success" : "primary"}
            size="sm"
            loading={saving}
            onClick={handleSave}
            leftIcon={saved ? <CheckCircle className="w-3.5 h-3.5" /> : undefined}
          >
            {saved ? "Saved!" : "Save changes"}
          </Button>
        </div>
      </div>

      <Card>
        <div className="divide-y divide-white/8">
          {DEFAULT_FLAGS.map((flag) => (
            <div key={flag.key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{flag.label}</p>
                  <Badge
                    variant={flag.plan === "pro" ? "violet" : "default"}
                    size="sm"
                  >
                    {flag.plan}
                  </Badge>
                  <Badge
                    variant={flags[flag.key] ? "emerald" : "red"}
                    size="sm"
                    dot
                  >
                    {flags[flag.key] ? "On" : "Off"}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{flag.desc}</p>
                <p className="text-[10px] text-gray-700 font-mono mt-0.5">{flag.key}</p>
              </div>
              <Toggle
                checked={flags[flag.key] ?? true}
                onChange={() => toggle(flag.key)}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
