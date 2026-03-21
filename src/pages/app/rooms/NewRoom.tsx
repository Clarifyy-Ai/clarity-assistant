import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Video, Loader2, Briefcase, Code, Users, Brain, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SESSION_TYPES = [
  { id: "behavioral", label: "Behavioral", icon: Users, desc: "STAR-method behavioral questions" },
  { id: "technical", label: "Technical", icon: Code, desc: "Coding & system design questions" },
  { id: "case_study", label: "Case Study", icon: Brain, desc: "Business case interview questions" },
  { id: "role_specific", label: "Role-Specific", icon: Briefcase, desc: "Questions tailored to your target role" },
];

const DIFFICULTIES = ["Easy", "Medium", "Hard"];
const DURATIONS = [15, 30, 45, 60];

export default function NewRoom() {
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();

  const [type, setType] = useState("behavioral");
  const [difficulty, setDifficulty] = useState("Medium");
  const [duration, setDuration] = useState(30);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!user?.id) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("practice_rooms")
        .insert({
          host_id: user.id,
          title: `${type.replace("_", " ")} Practice`,
          type,
          difficulty: difficulty.toLowerCase(),
          duration_minutes: duration,
          status: "active",
        })
        .select("id")
        .single();

      if (error) throw error;
      toast.success("Session started!");
      navigate(`/app/rooms/${data.id}`);
    } catch {
      toast.error("Failed to create session");
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Practice Session"
        description="Configure your mock interview"
        icon={<Video className="w-5 h-5 text-violet-400" />}
        breadcrumbs={[
          { label: "Practice Rooms", href: "/app/rooms" },
          { label: "New Session" },
        ]}
      />

      <div className="max-w-2xl space-y-6">
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Session Type</h3>
          <div className="grid grid-cols-2 gap-2">
            {SESSION_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                  type === t.id
                    ? "border-violet-500/40 bg-violet-500/10"
                    : "border-border hover:border-border hover:bg-accent/5"
                )}
              >
                <t.icon className={cn("w-5 h-5 mt-0.5", type === t.id ? "text-violet-500" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-medium text-foreground">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Difficulty</h3>
          <div className="flex gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={cn(
                  "px-4 py-2 rounded-xl border text-sm font-medium transition-all",
                  difficulty === d
                    ? "border-violet-500/40 bg-violet-500/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/5"
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Duration</h3>
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={cn(
                  "px-4 py-2 rounded-xl border text-sm font-medium transition-all",
                  duration === d
                    ? "border-violet-500/40 bg-violet-500/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/5"
                )}
              >
                {d} min
              </button>
            ))}
          </div>
        </Card>

        <Button
          variant="primary"
          size="lg"
          onClick={handleCreate}
          disabled={creating}
          leftIcon={creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          className="w-full"
        >
          {creating ? "Starting Session..." : "Start Interview Session"}
        </Button>
      </div>
    </div>
  );
}
