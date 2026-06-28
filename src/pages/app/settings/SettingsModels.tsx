import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { useOverlayStore } from "@/store/overlayStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Cpu, Check, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PreferredAIModel } from "@/types/user.types";
import { MODEL_OPTIONS, normalizePreferredModel } from "@/lib/ai/modelOptions";
import { normalizeToDisplayTier } from "@/lib/constants/pricing";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";

export default function SettingsModels() {
  const profile = useAuthStore((s) => s.profile);
  const planId = useAuthStore((s) => s.planId);
  const setProfile = useAuthStore((s) => s.setProfile);
  const isPro = normalizeToDisplayTier(planId) !== "free";

  const [selected, setSelected] = useState<PreferredAIModel>(
    normalizePreferredModel(profile?.preferred_model)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.preferred_model) {
      setSelected(normalizePreferredModel(profile.preferred_model));
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

      useOverlayStore.getState().setActiveModel(normalizePreferredModel(selected));

      toast.success("AI model preference saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPageShell title="AI Models">
      <Card>
        <div className="flex items-start gap-3 mb-4">
          <Cpu className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Default model</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Gemini Flash is the default for sub-second live hints. Pro plans unlock GPT-4o and
              Claude for deeper reasoning — routed automatically per task.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {MODEL_OPTIONS.map((m) => {
            const locked = !m.free && !isPro;
            return (
              <button
                key={m.value}
                type="button"
                disabled={locked}
                onClick={() => {
                  if (!locked) setSelected(m.value);
                }}
                className={cn(
                  "w-full text-left rounded-xl border p-3 transition-all",
                  selected === m.value && !locked
                    ? "border-primary/50 bg-primary/10"
                    : "border-border hover:border-primary/30",
                  locked && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{m.label}</span>
                  <Badge variant="secondary" size="sm" className="gap-1">
                    {locked ? (
                      <>
                        <Lock className="w-3 h-3" /> Pro
                      </>
                    ) : (
                      m.badge
                    )}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
              </button>
            );
          })}
        </div>

        <Button
          variant="primary"
          size="sm"
          className="mt-4"
          onClick={handleSave}
          disabled={
            saving ||
            selected === normalizePreferredModel(profile?.preferred_model ?? null)
          }
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
    </SettingsPageShell>
  );
}
