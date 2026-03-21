import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CheckCircle, Cpu, Zap, ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MODELS = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", desc: "Fast, versatile, great for most tasks", speed: "Fast", quality: "High" },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", desc: "Excellent reasoning and nuanced answers", speed: "Medium", quality: "Very High" },
  { id: "gemini-1-5-pro", name: "Gemini 1.5 Pro", provider: "Google", desc: "Strong at technical and analytical tasks", speed: "Fast", quality: "High" },
];

export default function SettingsModels() {
  const { profile, updateProfile } = useAuthStore();
  const [preferred, setPreferred] = useState(profile?.preferred_model ?? "gpt-4o");
  const [autoRoute, setAutoRoute] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({ preferred_model: preferred });
      toast.success("Model preference saved");
    } catch {
      toast.error("Failed to save preference");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">AI Models</h2>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">Preferred Model</h3>
        <div className="space-y-2">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => setPreferred(m.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                preferred === m.id
                  ? "border-violet-500/40 bg-violet-500/10"
                  : "border-border hover:border-border hover:bg-accent/5"
              )}
            >
              <Cpu className={cn("w-5 h-5 flex-shrink-0", preferred === m.id ? "text-violet-500" : "text-muted-foreground")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{m.name}</p>
                  <span className="text-[10px] text-muted-foreground">{m.provider}</span>
                </div>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-shrink-0">
                <span>Speed: {m.speed}</span>
                <span>Quality: {m.quality}</span>
              </div>
              {preferred === m.id && <CheckCircle className="w-4 h-4 text-violet-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Smart Model Routing</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically select the best model based on task type and complexity.
            </p>
          </div>
          <button onClick={() => setAutoRoute(!autoRoute)} className="text-muted-foreground hover:text-foreground">
            {autoRoute ? <ToggleRight className="w-8 h-8 text-violet-500" /> : <ToggleLeft className="w-8 h-8" />}
          </button>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-3">Fallback Order</h3>
        <p className="text-xs text-muted-foreground mb-3">
          If your preferred model is unavailable, the system will try these in order:
        </p>
        <div className="flex items-center gap-2">
          {MODELS.filter((m) => m.id !== preferred).map((m, i) => (
            <div key={m.id} className="flex items-center gap-2">
              {i > 0 && <Zap className="w-3 h-3 text-muted-foreground" />}
              <span className="text-xs px-2 py-1 rounded-lg bg-muted text-muted-foreground">{m.name}</span>
            </div>
          ))}
        </div>
      </Card>

      <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Preferences"}
      </Button>
    </div>
  );
}
