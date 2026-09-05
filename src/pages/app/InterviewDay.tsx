import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { DesktopDownloadButton } from "@/components/common/DesktopDownloadButton";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  CalendarDays, Clock, CheckCircle,
  Building2, Target, Mic, ChevronRight,
  Wind, Star, Volume2, VolumeX, Droplets, StickyNote, Monitor, Smartphone,
  Link2, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCurrentRound,
  getCurrentRoundDate,
  getCurrentRoundStatus,
  isInterviewScheduledToday,
} from "@/lib/interviews/roundHelpers";
import { format, differenceInMinutes } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { useDesktopDownload } from "@/hooks/useDesktopDownload";
import { stashPendingPracticeSetup } from "@/lib/session/lastPracticeSetup";
import type { LiveSessionConfig } from "@/types/session.types";
import { isElectronApp } from "@/lib/platform/isElectron";
import {
  isDailyChecklistScope,
  loadInterviewDayChecklist,
  resolveChecklistScopeId,
  upsertInterviewDayChecklistItem,
  writeLocalChecklist,
} from "@/lib/interview/interviewDayChecklist";
import { PAGE_SHELL_NARROW } from "@/lib/ui/responsivePage";
import { runLocalMicCheck } from "@/lib/audio/localMicPrecheck";
import { runSpeakerTest } from "@/lib/audio/speakerTest";
import { MicState, MIC_STATUS_COPY, SpeakerState, SPEAKER_STATUS_COPY } from "@/lib/audio/precheckStates";

// ─────────────────────────────────────────────────────────────────
// InterviewDay — focus mode for interview day
// Countdown, final checklist, quick affirmations, launch co-pilot
// ─────────────────────────────────────────────────────────────────

type ChecklistAction = "mic-test" | "meeting-link" | "documents" | "schedule";

const FINAL_CHECKLIST: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
  action?: ChecklistAction;
  actionLabel?: string;
}> = [
  {
    id: "audio",
    label: "Audio & mic working",
    icon: Volume2,
    hint: "Run a quick mic and speaker check before you join.",
    action: "mic-test",
    actionLabel: "Test audio",
  },
  {
    id: "quiet",
    label: "Quiet environment secured",
    icon: VolumeX,
    hint: "Close doors, mute notifications, and reduce background noise.",
  },
  {
    id: "water",
    label: "Water nearby",
    icon: Droplets,
    hint: "Keep water within reach — no need to leave mid-call.",
  },
  {
    id: "notes",
    label: "Quick notes printed/open",
    icon: StickyNote,
    hint: "Open your resume, JD, and STAR stories in Documents.",
    action: "documents",
    actionLabel: "Open documents",
  },
  {
    id: "browser",
    label: "Meeting link ready to open",
    icon: Monitor,
    hint: "Confirm the video link opens in your browser.",
    action: "meeting-link",
    actionLabel: "Open link",
  },
  {
    id: "phone",
    label: "Phone on silent",
    icon: Smartphone,
    hint: "Silence calls and notifications on your phone and desktop.",
  },
];

const ACTIVE_TODAY_STATUSES = new Set(["scheduled", "in_progress"]);

function isActiveTodayInterview(iv: Parameters<typeof isInterviewScheduledToday>[0]): boolean {
  return (
    isInterviewScheduledToday(iv) &&
    ACTIVE_TODAY_STATUSES.has(String(getCurrentRoundStatus(iv)))
  );
}

const AFFIRMATIONS = [
  "You've prepared hard for this. Trust your preparation.",
  "Every interviewer wants you to succeed.",
  "Take a breath. You know more than you think.",
  "Your experience is real and valuable.",
  "It's a conversation, not an interrogation.",
];

export default function InterviewDay() {
  const navigate  = useNavigate();
  const { profile, user } = useAuthStore();
  const store     = useInterviewSchedulerStore();
  const scheduler = useInterviewScheduler();
  const prefersReducedMotion = usePrefersReducedMotion();
  const { url: desktopInstallerUrl, loading: desktopInstallerLoading } = useDesktopDownload();

  useEffect(() => {
    scheduler.reload();
  }, []);

  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [selectedTodayId, setSelectedTodayId] = useState<string | null>(null);
  const checklistLoadGen = useRef(0);
  const [affIdx,    setAffIdx]    = useState(0);
  const [timeLeft,  setTimeLeft]  = useState("");
  const [breathing, setBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<"in" | "hold" | "out">("in");
  const [breathCount, setBreathCount] = useState(0);
  const [audioTesting, setAudioTesting] = useState(false);
  const [audioTestStatus, setAudioTestStatus] = useState<string | null>(null);
  const [audioTestOk, setAudioTestOk] = useState(false);

  // All interviews scheduled for today
  const todayInterviews = store.interviews.filter(isActiveTodayInterview).sort(
    (a, b) =>
      new Date(getCurrentRoundDate(a)).getTime() -
      new Date(getCurrentRoundDate(b)).getTime(),
  );

  useEffect(() => {
    const list = store.interviews
      .filter(isActiveTodayInterview)
      .sort(
        (a, b) =>
          new Date(getCurrentRoundDate(a)).getTime() -
          new Date(getCurrentRoundDate(b)).getTime(),
      );
    if (list.length === 0) {
      setSelectedTodayId(null);
      return;
    }
    setSelectedTodayId((prev) =>
      prev && list.some((iv) => iv.id === prev) ? prev : list[0].id,
    );
  }, [store.interviews]);

  const todayIv =
    todayInterviews.find((iv) => iv.id === selectedTodayId) ??
    todayInterviews[0] ??
    null;
  const todayRound = todayIv ? getCurrentRound(todayIv) : null;
  const todayScheduledAt = todayIv ? getCurrentRoundDate(todayIv) : null;
  const checklistScopeId = resolveChecklistScopeId(todayIv?.id ?? null);
  const checklistUsesDailyScope = isDailyChecklistScope(checklistScopeId);

  // Persist checklist per interview (or per-day fallback): Supabase + localStorage
  useEffect(() => {
    const scopeId = resolveChecklistScopeId(todayIv?.id ?? null);
    const gen = ++checklistLoadGen.current;
    void (async () => {
      const next = await loadInterviewDayChecklist(user?.id, scopeId);
      if (checklistLoadGen.current !== gen) return;
      setChecklist(next);
    })();
  }, [todayIv?.id, user?.id]);

  function toggleChecklistItem(id: string) {
    const scopeId = resolveChecklistScopeId(todayIv?.id ?? null);
    setChecklist((prev) => {
      const checked = !prev[id];
      const next = { ...prev, [id]: checked };
      void upsertInterviewDayChecklistItem({
        userId: user?.id,
        scopeId,
        itemId: id,
        checked,
        nextState: next,
      });
      return next;
    });
  }

  function resetChecklist() {
    const scopeId = resolveChecklistScopeId(todayIv?.id ?? null);
    const next: Record<string, boolean> = {};
    setChecklist(next);
    writeLocalChecklist(scopeId, next);
    setAudioTestStatus(null);
    setAudioTestOk(false);
  }

  const meetingLink = todayRound?.meeting_link ?? todayIv?.meeting_link ?? null;

  async function runAudioChecklistTest() {
    setAudioTesting(true);
    setAudioTestStatus("Checking microphone…");
    setAudioTestOk(false);
    try {
      const mic = await runLocalMicCheck({});
      if (mic.state !== MicState.READY) {
        setAudioTestStatus(MIC_STATUS_COPY[mic.state]);
        return;
      }
      setAudioTestStatus("Microphone OK — playing speaker test…");
      const speaker = await runSpeakerTest(null);
      if (speaker.state !== SpeakerState.READY) {
        setAudioTestStatus(SPEAKER_STATUS_COPY[speaker.state]);
        return;
      }
      setAudioTestOk(true);
      setAudioTestStatus("Mic and speaker passed — you're good to go.");
      setChecklist((prev) => {
        if (prev.audio) return prev;
        const next = { ...prev, audio: true };
        void upsertInterviewDayChecklistItem({
          userId: user?.id,
          scopeId: resolveChecklistScopeId(todayIv?.id ?? null),
          itemId: "audio",
          checked: true,
          nextState: next,
        });
        return next;
      });
    } catch {
      setAudioTestStatus("Audio check failed. Try again or use Practice Coach setup.");
    } finally {
      setAudioTesting(false);
    }
  }

  function handleChecklistAction(action: ChecklistAction) {
    switch (action) {
      case "mic-test":
        void runAudioChecklistTest();
        break;
      case "meeting-link":
        if (meetingLink) {
          window.open(meetingLink, "_blank", "noopener,noreferrer");
          setChecklist((prev) => {
            if (prev.browser) return prev;
            const next = { ...prev, browser: true };
            void upsertInterviewDayChecklistItem({
              userId: user?.id,
              scopeId: resolveChecklistScopeId(todayIv?.id ?? null),
              itemId: "browser",
              checked: true,
              nextState: next,
            });
            return next;
          });
        } else {
          navigate("/app/interviews/new");
        }
        break;
      case "documents":
        navigate("/app/documents");
        break;
      case "schedule":
        navigate("/app/interviews/new");
        break;
    }
  }

  // Countdown timer
  useEffect(() => {
    if (!todayIv || !todayScheduledAt) return;
    const tick = () => {
      const diff = differenceInMinutes(
        new Date(todayScheduledAt),
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
  }, [todayIv, todayScheduledAt]);

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

  const practiceCoachHref = useMemo(() => {
    const params = new URLSearchParams();
    if (todayIv?.id) params.set("interviewId", todayIv.id);
    if (todayIv?.company_name) params.set("company", todayIv.company_name);
    if (todayIv?.role_title) params.set("role", todayIv.role_title);
    const qs = params.toString();
    return qs ? `/app/live?${qs}` : "/app/live";
  }, [todayIv?.id, todayIv?.company_name, todayIv?.role_title]);

  function stashInterviewContextForCoach() {
    if (!todayIv) return;
    const partial: LiveSessionConfig = {
      company: todayIv.company_name || null,
      role: todayIv.role_title || null,
      hint_style: "short_hints",
      model: "gemini-flash",
      smart_routing: false,
      stealth_mode: false,
      resume_id: null,
      jd_id: null,
      interview_type: "behavioral",
      instructions: `Interview Day context for ${todayIv.company_name} — ${todayIv.role_title}`,
      enable_system_audio: true,
      save_transcript: true,
    };
    stashPendingPracticeSetup(partial);
  }

  if (store.is_loading) {
    return (
      <div data-testid="page-width-root" className={cn(PAGE_SHELL_NARROW, "space-y-5")}>
        <PageHeader
          title={`You've got this, ${firstName}`}
          description="Focus mode for interview day — countdown, checklist, and calm prep"
          badge="Interview Day"
          icon={<Target className="w-5 h-5 text-primary" />}
          breadcrumbs={[
            { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
            { label: PRODUCT_NAMES.interviewDay },
          ]}
        />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div data-testid="page-width-root" className={cn(PAGE_SHELL_NARROW, "space-y-5")}>
      <PageHeader
        title={`You've got this, ${firstName}`}
        description="Focus mode for interview day — countdown, checklist, and calm prep"
        badge="Interview Day"
        icon={<Target className="w-5 h-5 text-primary" />}
        breadcrumbs={[
          { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
          { label: PRODUCT_NAMES.interviewDay },
        ]}
      />

      {store.load_error && (
        <InlineErrorRetry
          message={store.load_error}
          onRetry={() => scheduler.reload()}
        />
      )}

      {/* Multi-interview picker */}
      {todayInterviews.length > 1 && (
        <Card className="p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Today&apos;s interviews
          </p>
          <div className="flex flex-wrap gap-2">
            {todayInterviews.map((iv) => {
              const when = getCurrentRoundDate(iv);
              const active = iv.id === todayIv?.id;
              return (
                <button
                  key={iv.id}
                  type="button"
                  onClick={() => setSelectedTodayId(iv.id)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left text-xs transition-all min-h-11",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="font-semibold block">{iv.company_name}</span>
                  <span className="text-[10px]">
                    {format(new Date(when), "h:mm a")}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Interview info + countdown */}
      {todayIv ? (
        <Card className="bg-gradient-to-r from-primary/15 to-blue-600/15 border-primary/30">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-primary-foreground" />
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
                  {format(new Date(todayScheduledAt!), "h:mm a")}
                  {(todayRound?.duration_minutes ?? todayIv.duration_minutes) &&
                    ` · ${todayRound?.duration_minutes ?? todayIv.duration_minutes}min`}
                </p>
              </div>
            </div>
            {timeLeft && (
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  Starts in
                </p>
                <p className="text-2xl font-black text-primary">
                  {timeLeft}
                </p>
              </div>
            )}
          </div>

          {(todayRound?.meeting_link ?? todayIv.meeting_link) && (
            <a
              href={todayRound?.meeting_link ?? todayIv.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-between p-3 bg-accent/5 hover:bg-accent/10 border border-border rounded-xl transition-all"
            >
              <span className="text-xs text-foreground flex items-center gap-2 min-w-0">
                <Link2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{todayRound?.meeting_link ?? todayIv.meeting_link}</span>
              </span>
              <span className="text-xs text-primary shrink-0 ml-2 inline-flex items-center gap-1">
                Open <ExternalLink className="w-3 h-3" aria-hidden />
              </span>
            </a>
          )}
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="No interview scheduled for today"
            description="Schedule an interview to unlock countdown and focus mode. The checklist below still works for general day-of prep."
            actionLabel="Schedule interview"
            onAction={() => navigate("/app/interviews/new")}
            compact
          />
        </Card>
      )}

      {/* Affirmation ticker */}
      <Card className="text-center py-5 bg-amber-500/5 border-amber-500/20">
        <Star className="w-5 h-5 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200 leading-relaxed transition-all">
          &ldquo;{AFFIRMATIONS[affIdx]}&rdquo;
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
          prefersReducedMotion ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-sm font-bold text-foreground">
                {breathPhase === "in"   ? "Inhale — 4 seconds" :
                 breathPhase === "hold" ? "Hold — 4 seconds"   : "Exhale — 4 seconds"}
              </p>
              <p className="text-xs text-muted-foreground">
                Cycle {breathCount + 1} of 4 · follow the text cues (animation reduced)
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
          )
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed">
            4-4-4 box breathing: inhale for 4 seconds, hold for 4,
            exhale for 4. Repeat 4 times to reduce anxiety.
          </p>
        )}
      </Card>

      {/* Final checklist */}
      <Card data-testid="interview-day-checklist">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Final checklist
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {checklistDone}/{FINAL_CHECKLIST.length}
            </span>
            {checklistDone > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="interview-day-checklist-reset"
                onClick={resetChecklist}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
        {checklistUsesDailyScope ? (
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            No interview scheduled for today — checklist saves on this device for today only.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Checklist syncs with today&apos;s interview. Use the test actions below to verify your setup.
          </p>
        )}
        <div className="space-y-2">
          {FINAL_CHECKLIST.map((item) => {
            const resolvedAction =
              item.action === "meeting-link" && !meetingLink ? "schedule" : item.action;
            const resolvedActionLabel =
              resolvedAction === "schedule"
                ? "Schedule interview"
                : resolvedAction === "meeting-link"
                  ? "Open link"
                  : item.actionLabel;

            return (
              <div
                key={item.id}
                data-testid={`interview-day-checklist-${item.id}`}
                className={cn(
                  "rounded-xl border border-border/60 p-3 transition-all",
                  checklist[item.id] && "bg-emerald-500/5 border-emerald-500/20",
                )}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    aria-label={`Mark ${item.label} as ${checklist[item.id] ? "incomplete" : "complete"}`}
                    aria-pressed={Boolean(checklist[item.id])}
                    onClick={() => toggleChecklistItem(item.id)}
                    className="mt-0.5 shrink-0 min-h-11 min-w-11 flex items-center justify-center -m-2"
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                        checklist[item.id]
                          ? "bg-emerald-500 border-emerald-500"
                          : "border-border",
                      )}
                    >
                      {checklist[item.id] && (
                        <CheckCircle className="w-3 h-3 text-foreground" />
                      )}
                    </div>
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <item.icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            checklist[item.id]
                              ? "text-muted-foreground line-through"
                              : "text-foreground",
                          )}
                        >
                          {item.label}
                        </p>
                        {item.hint && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {item.hint}
                          </p>
                        )}
                        {item.id === "audio" && audioTestStatus && (
                          <p
                            role="status"
                            aria-live="polite"
                            data-testid="interview-day-audio-test-status"
                            className={cn(
                              "text-xs mt-1.5 leading-relaxed",
                              audioTestOk
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-amber-800 dark:text-amber-200",
                            )}
                          >
                            {audioTestStatus}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {resolvedAction && resolvedActionLabel && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0 min-h-11"
                      data-testid={`interview-day-checklist-action-${item.id}`}
                      disabled={item.id === "audio" && audioTesting}
                      onClick={() => handleChecklistAction(resolvedAction)}
                    >
                      {item.id === "audio" && audioTesting ? "Testing…" : resolvedActionLabel}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <ProgressBar
          value={checklistDone}
          max={FINAL_CHECKLIST.length}
          color={allDone ? "emerald" : "violet"}
          size="sm"
          className="mt-4"
        />
        {allDone && (
          <p
            role="status"
            data-testid="interview-day-checklist-complete"
            className="text-xs text-emerald-700 dark:text-emerald-300 mt-3 text-center font-medium"
          >
            All set — you&apos;re ready for your interview.
          </p>
        )}
      </Card>

      {/* Launch Practice Coach — web primary; no Retry for unpublished installer */}
      <div className="space-y-3">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={() => {
            stashInterviewContextForCoach();
            navigate(practiceCoachHref);
          }}
          leftIcon={<Mic className="w-5 h-5" />}
          rightIcon={<ChevronRight className="w-5 h-5" />}
          className="py-4 text-base"
        >
          Continue in browser
        </Button>
        {!isElectronApp() && (
          <DesktopDownloadButton
            fullWidth
            size="md"
            variant="outline"
            webCoachHref={practiceCoachHref}
            showGuideLink={false}
            compact
          />
        )}
        {!isElectronApp() && !desktopInstallerUrl && !desktopInstallerLoading && (
          <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
            Desktop installer isn&apos;t published for this environment yet — use Continue in browser
            above. No retry needed until an installer artifact is configured.
          </p>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Opens {PRODUCT_NAMES.practiceCoach} with today&apos;s interview context when available.
          For interview rehearsal only — not for use during real interviews.
        </p>
      </div>
    </div>
  );
}
