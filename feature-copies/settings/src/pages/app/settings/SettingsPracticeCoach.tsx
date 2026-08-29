// @ts-nocheck -- hint_style / coach_tone live in profiles JSON preferences; not yet on generated Tables<"profiles"> Update type.
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, Loader2, BookOpen, Sparkles, MessageSquare } from "lucide-react";
import type { HintStyle, CoachTone } from "@/types/user.types";

const HINT_STYLE_OPTIONS: { value: HintStyle; label: string; desc: string; badge?: string }[] = [
  {
    value: "short_hints",
    label: "Short & Punchy Cues",
    desc: "Brief bullet points and quick situational prompts that jog your memory without reading verbatim.",
    badge: "Recommended",
  },
  {
    value: "keywords_only",
    label: "Keywords Only",
    desc: "Minimalist display focusing strictly on key framework terms and vocabulary milestones.",
    badge: "Minimalist",
  },
  {
    value: "full_answer",
    label: "Comprehensive Script",
    desc: "Detailed STAR structural breakdown and complete suggested answer phrasing for rigorous prep.",
    badge: "Detailed",
  },
];

const COACH_TONE_OPTIONS: { value: CoachTone; label: string; desc: string }[] = [
  {
    value: "encouraging",
    label: "Encouraging & Supportive",
    desc: "Provides uplifting guidance, celebrating strengths while constructive on improvement areas.",
  },
  {
    value: "direct",
    label: "Direct & Concise",
    desc: "Straight to the point with zero fluff, immediately highlighting missed milestones and filler habits.",
  },
  {
    value: "formal",
    label: "Executive Formal",
    desc: "Professional corporate demeanor tailored for senior management, director, and executive rehearsals.",
  },
  {
    value: "casual",
    label: "Casual & Conversational",
    desc: "Friendly, low-pressure peer interaction designed to ease anxiety and build communicative confidence.",
  },
];

export default function SettingsPracticeCoach() {
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const navigate = useNavigate();

  const [hintStyle, setHintStyle] = useState<HintStyle>((profile?.hint_style as HintStyle) ?? "short_hints");
  const [coachTone, setCoachTone] = useState<CoachTone>((profile?.coach_tone as CoachTone) ?? "encouraging");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (profile) {
      if (profile.hint_style) setHintStyle(profile.hint_style as HintStyle);
      if (profile.coach_tone) setCoachTone(profile.coach_tone as CoachTone);
    }
  }, [profile?.hint_style, profile?.coach_tone]);

  async function handleSave() {
    if (!profile?.id) return;
    setSaving(true);
    setSaved(false);
    setSaveFailed(false);
    try {
      await updateProfile({
        hint_style: hintStyle as any,
        coach_tone: coachTone as any,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Practice Coach preferences saved successfully.");
    } catch (err) {
      setSaveFailed(true);
      toast.error(err instanceof Error ? err.message : "Failed to save coach preferences.");
    } finally {
      setSaving(false);
    }
  }

  const isUnchanged =
    hintStyle === (profile?.hint_style ?? "short_hints") &&
    coachTone === (profile?.coach_tone ?? "encouraging");

  return (
    <SettingsPageShell
      title="Practice Coach Preferences"
      subtitle="Customize AI hint behavior and conversational tone during live rehearsal sessions."
    >
      <div className="space-y-6">
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 border-b pb-3 border-border">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-base font-semibold text-foreground">Real-Time Hint Style</h3>
              <p className="text-xs text-muted-foreground">Control how detailed the live guidance prompts appear on screen.</p>
            </div>
          </div>
          <div className="grid gap-3">
            {HINT_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setHintStyle(opt.value)}
                className={cn(
                  "w-full text-left rounded-xl border p-3 transition-all",
                  hintStyle === opt.value
                    ? "border-primary/50 bg-primary/10"
                    : "border-border hover:border-primary/30"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                  {opt.badge && (
                    <Badge variant="secondary" size="sm">
                      {opt.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 border-b pb-3 border-border">
            <MessageSquare className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-base font-semibold text-foreground">AI Coach Persona Tone</h3>
              <p className="text-xs text-muted-foreground">Adjust the conversational voice used during live rehearsal debriefs and feedback.</p>
            </div>
          </div>
          <div className="grid gap-3">
            {COACH_TONE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCoachTone(opt.value)}
                className={cn(
                  "w-full text-left rounded-xl border p-3 transition-all",
                  coachTone === opt.value
                    ? "border-primary/50 bg-primary/10"
                    : "border-border hover:border-primary/30"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>
        </Card>

        <div className="flex items-center justify-between gap-4 pt-2">
          <Button
            variant={saved ? "success" : saveFailed ? "danger" : "primary"}
            size="md"
            onClick={() => void handleSave()}
            disabled={saving || (isUnchanged && !saveFailed)}
            leftIcon={
              saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />
            }
          >
            {saving
              ? "Saving…"
              : saved
                ? "Saved!"
                : saveFailed
                  ? "Failed — retry"
                  : "Save preferences"}
          </Button>
        </div>

        <Card className="p-5 bg-secondary/30 border-primary/20 mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Interactive Practice Coach Guide
              </h4>
              <p className="text-xs text-muted-foreground max-w-lg">
                Need help setting up mic permissions, configuring keyboard shortcuts, or mastering the real-time feedback overlay? Check out our complete user manual.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/app/guide/practice-coach")}
              className="shrink-0"
            >
              View Full Guide
            </Button>
          </div>
        </Card>
      </div>
    </SettingsPageShell>
  );
}
