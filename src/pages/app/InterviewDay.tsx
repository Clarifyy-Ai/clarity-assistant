// @ts-nocheck
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { useAuthStore } from "@/store/userStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
  CalendarDays, Clock, CheckCircle,
  Circle, Mic, Brain, Zap,
  ChevronRight, Building2, Target,
  Wind, Star, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInMinutes } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// InterviewDay — focus mode for interview day
// Countdown, final checklist, quick affirmations, launch co-pilot
// ─────────────────────────────────────────────────────────────────

const FINAL_CHECKLIST = [
  { id: "audio",    label: "Audio & mic working",           icon: "🎤" },
  { id: "quiet",    label: "Quiet environment secured",     icon: "🔇" },
  { id: "water",    label: "Water nearby",                  icon: "💧" },
  { id: "notes",    label: "Quick notes printed/open",      icon: "📝" },
  { id: "browser",  label: "Meeting link ready to open",    icon: "🖥️" },
  { id: "phone",    label: "Phone on silent",               icon: "📵" },
];

const AFFIRMATIONS = [
  "You've prepared hard for this. Trust your preparation.",
  "Every interviewer wants you to succeed.",
  "Take a breath. You know more than you think.",
  "Your experience is real and valuable.",
  "It's a conversation, not an interrogation.",
];

export default function InterviewDay() {
  const navigate  = useNavigate();
  const { profile } = useAuthStore();
  const store     = useInterviewSchedulerStore();

  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [affIdx,    setAffIdx]    = useState(0);
  const [timeLeft,  setTimeLeft]  = useState("");
  const [breathing, setBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<"in" | "hold" | "out">("in");
  const [breathCount, setBreathCount] = useState(0);

  // Today's interview
  const todayIv = store.interviews.find((iv) => {
    const d = new Date(iv.scheduled_at);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth()    === now.getMonth()    &&
      d.getDate()     === now.getDate()     &&
      iv.status === "scheduled"
    );
  });

  // Countdown timer
  useEffect(() => {
    if (!todayIv) return;
    const tick = () => {
      const diff = differenceInMinutes(
        new Date(todayIv.scheduled_at),
        new Date()
      );
      if (diff <= 0) {
        setTimeLeft("Starting now!");
        return;
      }
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      setTimeLeft(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [todayIv]);

  // Rotate affirmation every 8s
  useEffect(() => {
    const t = setInterval(() => {
      setAffIdx((p) => (p + 1) % AFFIRMATIONS.length);
    }, 8000);
    return () => clearInterval(t);
  }, []);

  // Box breathing cycle
  useEffect(() => {
    if (!breathing) return;
    const PHASES: ("in" | "hold" | "out")[] = ["in", "hold", "out"];
    let phaseIdx = 0;
    const t = setInterval(() => {
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      setBreathPhase(PHASES[phaseIdx]);
      if (phaseIdx === 0) {
        setBreathCount((p) => {
          if (p >= 4) { setBreathing(false); return 0; }
          return p + 1;
        });
      }
    }, 4000);
    return () => clearInterval(t);
  }, [breathing]);

  const checklistDone = FINAL_CHECKLIST.filter(
    (item) => checklist[item.id]
  ).length;
  const allDone = checklistDone === FINAL_CHECKLIST.length;

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="text-center py-4">
        <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-2">
          Interview Day
        </p>
        <h1 className="text-3xl font-black text-foreground">
          You've got this, {firstName} 🎯
        </h1>
      </div>

      {/* Interview info + countdown */}
      {todayIv ? (
        <Card className="bg-gradient-to-r from-violet-600/15 to-blue-600/15 border-violet-500/30">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-violet-600 rounded-2xl flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-foreground" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">
                  {todayIv.company_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {todayIv.role_title}
                </p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(todayIv.scheduled_at), "h:mm a")}
                  {todayIv.duration_minutes && ` · ${todayIv.duration_minutes}min`}
                </p>
              </div>
            </div>
            {timeLeft && (
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  Starts in
                </p>
                <p className="text-2xl font-black text-violet-400">
                  {timeLeft}
                </p>
              </div>
            )}
          </div>

          {todayIv.meeting_link && (
            <a
              href={todayIv.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-between p-3 bg-accent/5 hover:bg-accent/10 border border-border rounded-xl transition-all"
            >
              <span className="text-xs text-foreground">
                🔗 {todayIv.meeting_link.slice(0, 50)}…
              </span>
              <span className="text-xs text-violet-400 shrink-0 ml-2">Open ↗</span>
            </a>
          )}
        </Card>
      ) : (
        <Card className="text-center py-6">
          <CalendarDays className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">No interview scheduled for today.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => navigate("/app/interviews/new")}
          >
            Schedule one
          </Button>
        </Card>
      )}

      {/* Affirmation ticker */}
      <Card className="text-center py-5 bg-amber-500/5 border-amber-500/20">
        <Star className="w-5 h-5 text-amber-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-amber-200 leading-relaxed transition-all">
          "{AFFIRMATIONS[affIdx]}"
        </p>
        <div className="flex justify-center gap-1 mt-3">
          {AFFIRMATIONS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 rounded-full transition-all",
                i === affIdx
                  ? "w-4 bg-amber-400"
                  : "w-1 bg-amber-400/20"
              )}
            />
          ))}
        </div>
      </Card>

      {/* Breathing exercise */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground">Box breathing</h3>
            <Badge variant="blue" size="sm">Calms nerves</Badge>
          </div>
          {!breathing ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setBreathing(true); setBreathPhase("in"); setBreathCount(0); }}
            >
              Start
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBreathing(false)}
            >
              Stop
            </Button>
          )}
        </div>

        {breathing ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className={cn(
              "w-24 h-24 rounded-2xl border-4 flex items-center justify-center transition-all duration-[4000ms]",
              breathPhase === "in"
                ? "border-emerald-500 scale-110 bg-emerald-500/10"
                : breathPhase === "hold"
                ? "border-amber-500 scale-110 bg-amber-500/10"
                : "border-blue-500 scale-90 bg-blue-500/10"
            )}>
              <p className={cn(
                "text-sm font-bold",
                breathPhase === "in"   ? "text-emerald-400" :
                breathPhase === "hold" ? "text-amber-400"   : "text-blue-400"
              )}>
                {breathPhase === "in"   ? "Inhale" :
                 breathPhase === "hold" ? "Hold"   : "Exhale"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Cycle {breathCount + 1} of 4
            </p>
            <ProgressBar
              value={breathCount + 1}
              max={4}
              color="blue"
              size="xs"
              className="w-32"
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed">
            4-4-4 box breathing: inhale for 4 seconds, hold for 4,
            exhale for 4. Repeat 4 times to reduce anxiety.
          </p>
        )}
      </Card>

      {/* Final checklist */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Final checklist
          </h3>
          <span className="text-xs text-muted-foreground">
            {checklistDone}/{FINAL_CHECKLIST.length}
          </span>
        </div>
        <div className="space-y-2">
          {FINAL_CHECKLIST.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                setChecklist((p) => ({ ...p, [item.id]: !p[item.id] }))
              }
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/5 transition-all text-left"
            >
              <div className={cn(
                "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                checklist[item.id]
                  ? "bg-emerald-500 border-emerald-500"
                  : "border-border"
              )}>
                {checklist[item.id] && (
                  <CheckCircle className="w-3 h-3 text-foreground" />
                )}
              </div>
              <span className="text-base">{item.icon}</span>
              <span className={cn(
                "text-sm",
                checklist[item.id]
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              )}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
        <ProgressBar
          value={checklistDone}
          max={FINAL_CHECKLIST.length}
          color={allDone ? "emerald" : "violet"}
          size="sm"
          className="mt-4"
        />
      </Card>

      {/* Launch co-pilot */}
      <div className="space-y-3">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={() => navigate("/app/live")}
          leftIcon={<Mic className="w-5 h-5" />}
          rightIcon={<ChevronRight className="w-5 h-5" />}
          className="py-4 text-base"
        >
          Launch Live Practice Coach
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          For interview rehearsal only — not for use during real interviews.
        </p>
      </div>
    </div>
  );
}
