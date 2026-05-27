import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { useOverlayStore } from "@/store/overlayStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Cpu, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PreferredAIModel } from "@/types/user.types";

const LAUNCH_MODELS: { value: PreferredAIModel; label: string; desc: string; badge: string }[] = [
  {
    value: "gemini-flash",
    label: "Gemini Flash",
    desc: "Fastest responses — best for live interviews and quick hints.",
    badge: "Recommended",
  },
  {
    value: "gemini-pro",
    label: "Gemini Pro",
    desc: "Deeper reasoning — system design and complex behavioural answers.",
    badge: "Pro quality",
  },
];

export default function SettingsModels() {
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [selected, setSelected] = useState<PreferredAIModel>(
    (profile?.preferred_model as PreferredAIModel) ?? "gemini-flash"
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.preferred_model) {
      setSelected(profile.preferred_model as PreferredAIModel);
    }
  }, [profile?.preferred_model]);

  async function handleSave() {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ preferred_model: selected as any, updated_at: new Date().toISOString() })
        .eq("id", profile.id)
        .select()
        .single();

      if (error) throw error;
      if (data) setProfile(data as unknown as typeof profile);

      useOverlayStore.getState().setActiveModel(
        selected === "gemini-pro" ? "gemini-pro" : "gemini-flash"
      );

      toast.success("AI model preference saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">AI Models</h2>

      <Card>
        <div className="flex items-start gap-3 mb-4">
          <Cpu className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Default model</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Launch uses Google Gemini only. Your choice applies to live co-pilot, mock
              interviews, and prep tools.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {LAUNCH_MODELS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setSelected(m.value)}
              className={cn(
                "w-full text-left rounded-xl border p-3 transition-all",
                selected === m.value
                  ? "border-violet-500/50 bg-violet-500/10"
                  : "border-border hover:border-violet-500/30"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{m.label}</span>
                <Badge variant="secondary" size="sm">
                  {m.badge}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
            </button>
          ))}
        </div>

        <Button
          variant="primary"
          size="sm"
          className="mt-4"
          onClick={handleSave}
          disabled={saving || selected === profile?.preferred_model}
          leftIcon={
            saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )
          }
        >
          {saving ? "Saving…" : "Save preference"}
        </Button>
      </Card>
    </div>
  );
}
