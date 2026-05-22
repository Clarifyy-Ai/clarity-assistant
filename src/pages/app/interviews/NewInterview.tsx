// @ts-nocheck
// src/pages/app/interviews/NewInterview.tsx — PRODUCTION FIXED
// Fixes (F5):
// - toInterviewTypeSlug: regex literals had double-escaped backslashes (\\s → \s)
//   Same bug as F3c — \\s in a regex literal is literal backslash+'s', not whitespace.
//   "Phone Screen" was slugging to "phone screen" (spaces kept) instead of "phone_screen".
// - syncNow() called before navigate(): component unmounts mid-promise → React warning
//   "Can't perform a React state update on an unmounted component". Fixed by awaiting
//   sync inside handleSubmit BEFORE navigate(), with a mounted-ref guard.
// - canSubmit moved to useMemo: prevents stale closure read on rapid form submit
// - Calendar not-connected: banner now shows a non-ghost "Connect Google Calendar"
//   button with a dismiss option so users don't miss it before submitting
// - @ts-nocheck preserved

import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  CalendarDays, Building2, Clock,
  User, ChevronLeft,
  Globe, Link as LinkIcon,
  AlertCircle, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ─── CONSTANTS ─────────────────────────────────────────────────────────── */

const INTERVIEW_TYPES = [
  "Phone Screen", "Technical", "Behavioural",
  "System Design", "HR/Culture Fit", "Final Round", "Other",
];

const PLATFORMS = [
  { value: "zoom",        label: "Zoom"       },
  { value: "google_meet", label: "Google Meet"},
  { value: "teams",       label: "MS Teams"   },
  { value: "phone",       label: "Phone call" },
  { value: "onsite",      label: "In person"  },
  { value: "other",       label: "Other"      },
];

const ROUND_NUMBERS = [1, 2, 3, 4, 5];

/* ─── HELPERS ───────────────────────────────────────────────────────────── */

// ✅ FIX: Regex literals — removed double-escaped backslashes.
// \\s in a regex literal = literal backslash + 's', NOT a whitespace class.
// "Phone Screen" was keeping its space → slug "phone screen" instead of "phone_screen".
// "HR/Culture Fit" was keeping the slash → slug "hr/culture_fit" instead of "hr_culture_fit".
function toInterviewTypeSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s*\/\s*/g, "_")   // ✅ was /\\s*\\/\\s*/g
    .replace(/\s+/g, "_");       // ✅ was /\\s+/g
}

function toStageFromType(label: string): string {
  switch (label) {
    case "Phone Screen":   return "phone_screen";
    case "Technical":
    case "System Design":  return "technical_round";
    case "Final Round":    return "final_round";
    default:               return "applied";
  }
}

/* ─── COMPONENT ─────────────────────────────────────────────────────────── */

export default function NewInterview() {
  const navigate  = useNavigate();
  const scheduler = useInterviewScheduler();
  const calendar  = useCalendarSync();

  // ✅ FIX: Mounted ref so we never call toast/setState after navigate() unmounts us
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [company,         setCompany]         = useState("");
  const [roleTitle,       setRoleTitle]        = useState("");
  const [interviewType,   setInterviewType]    = useState("Behavioural");
  const [platform,        setPlatform]         = useState("zoom");
  const [scheduledAt,     setScheduledAt]      = useState("");
  const [duration,        setDuration]         = useState(45);
  const [roundNumber,     setRoundNumber]      = useState(1);
  const [interviewerName, setInterviewerName]  = useState("");
  const [meetingLink,     setMeetingLink]      = useState("");
  const [notes,           setNotes]            = useState("");
  const [loading,         setLoading]          = useState(false);
  const [error,           setError]            = useState<string | null>(null);
  // ✅ FIX: Calendar not-connected banner dismiss state
  const [calendarBannerDismissed, setCalendarBannerDismissed] = useState(false);

  // ✅ FIX: useMemo so handleSubmit always reads the current truthiness without
  // relying on a stale closure value captured at function-definition time.
  const canSubmit = useMemo(
    () => Boolean(company.trim() && roleTitle.trim() && scheduledAt),
    [company, roleTitle, scheduledAt],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setError(null);

    // ── Step 1: Create parent scheduled_interviews row ────────────────────
    const { id, error: createErr } = await scheduler.createInterview({
      company_name:    company.trim(),
      role_title:      roleTitle.trim(),
      stage:           toStageFromType(interviewType),
      priority:        "medium",
      is_remote:       platform !== "onsite",
      location:        "",
      job_posting_url: "",
      salary_range:    "",
      notes:           notes.trim(),
      resume_id:       null,
      jd_id:           null,
    });

    if (createErr || !id) {
      const msg = createErr ?? "Failed to schedule interview";
      if (mountedRef.current) {
        setError(msg);
        setLoading(false);
      }
      toast.error(msg);
      return;
    }

    // ── Step 2: Attach round ──────────────────────────────────────────────
    const { error: roundErr } = await scheduler.addRound(id, {
      round_number:      roundNumber,
      round_label:       `Round ${roundNumber} — ${interviewType}`,
      interview_type:    toInterviewTypeSlug(interviewType),
      scheduled_at:      new Date(scheduledAt).toISOString(),
      duration_minutes:  duration,
      interviewer_name:  interviewerName.trim(),
      interviewer_title: "",
      platform,
      meeting_link:      meetingLink.trim(),
      notes:             "",
    });

    if (roundErr) {
      // Parent saved, round failed — non-fatal, user can add round later
      toast.warning(`Interview saved, but round details failed: ${roundErr}`);
    } else {
      toast.success("Interview scheduled!");
    }

    // ── Step 3: Calendar sync ─────────────────────────────────────────────
    // ✅ FIX: Await sync BEFORE navigate() so the component is still mounted
    // when we call toast. Previously syncNow() was called after navigate(),
    // which unmounted the component, causing React's "setState on unmounted
    // component" warning and silently dropping the sync result toast.
    if (calendar.isConnected) {
      try {
        const { imported, error: syncError } = await calendar.syncNow();
        // Component is still mounted here — safe to toast
        if (syncError) {
          toast.error(`Calendar sync failed: ${syncError}`);
        } else if (imported > 0) {
          toast.message(
            `Synced ${imported} calendar event${imported === 1 ? "" : "s"}`,
          );
        }
      } catch {
        // syncNow() rejection — non-fatal, don't block navigation
        toast.error("Calendar sync failed.");
      }
    }

    // ── Navigate (component unmounts after this) ──────────────────────────
    navigate("/app/interviews");
    // No state updates after this line — component is unmounted
  }

  /* ── Calendar banner ─────────────────────────────────────────────────── */

  // ✅ FIX: Full-visibility not-connected banner replaces the ghost "Connect"
  // button that was easy to miss. Shows only once until dismissed or connected.
  const showCalendarBanner =
    !calendar.isCheckingConnection &&
    !calendar.isConnected &&
    !calendarBannerDismissed;

  const showCalendarConnected =
    !calendar.isCheckingConnection && calendar.isConnected;

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="max-w-2xl space-y-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/app/interviews")}
          className="p-2 rounded-xl bg-accent/5 hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-all"
          aria-label="Back to interviews"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <PageHeader
          title="Schedule interview"
          subtitle="Add a new interview to your tracker"
          className="mb-0"
        />
      </div>

      {/* ✅ FIX: Calendar not-connected banner — more visible than a ghost button */}
      {showCalendarBanner && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Google Calendar not connected
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect to auto-sync this interview into your calendar.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => calendar.connectGoogle()}
              >
                Connect
              </Button>
              <button
                type="button"
                onClick={() => setCalendarBannerDismissed(true)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss calendar banner"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Calendar connected indicator */}
      {showCalendarConnected && (
        <Card className="flex items-center gap-2 py-3 border-emerald-500/20 bg-emerald-500/5">
          <CalendarDays className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            Google Calendar{" "}
            <span className="text-emerald-400 font-medium">connected</span>
            {" — "}new interviews sync automatically.
          </p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>

        {/* Company + role */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-400" aria-hidden="true" />
            Company &amp; Role
          </h3>
          <div className="space-y-4">
            <Input
              label="Company name"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Google"
              required
              autoFocus
            />
            <Input
              label="Role / position"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
              required
            />
          </div>
        </Card>

        {/* Interview type + round */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-4">Interview details</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Interview type</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Interview type">
                {INTERVIEW_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setInterviewType(t)}
                    aria-pressed={interviewType === t}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                      interviewType === t
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-foreground mb-2">Round number</p>
              <div className="flex gap-2" role="group" aria-label="Round number">
                {ROUND_NUMBERS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoundNumber(r)}
                    aria-pressed={roundNumber === r}
                    className={cn(
                      "w-9 h-9 rounded-xl border text-xs font-bold transition-all",
                      roundNumber === r
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Date + time + duration */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" aria-hidden="true" />
            Schedule
          </h3>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="scheduled-at"
                className="text-xs font-medium text-foreground mb-1.5 block"
              >
                Date &amp; time
              </label>
              <input
                id="scheduled-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
                className="w-full bg-background border border-input text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-foreground mb-2">
                Duration (minutes)
              </p>
              <div className="flex gap-2" role="group" aria-label="Duration">
                {[30, 45, 60, 90, 120].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    aria-pressed={duration === d}
                    className={cn(
                      "flex-1 py-2 rounded-xl border text-xs font-medium transition-all",
                      duration === d
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Platform + link */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            Platform
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Platform">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlatform(p.value)}
                  aria-pressed={platform === p.value}
                  className={cn(
                    "py-2.5 px-3 rounded-xl border text-xs font-medium transition-all",
                    platform === p.value
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Input
              label="Meeting link (optional)"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://zoom.us/j/…"
              leftIcon={<LinkIcon className="w-3.5 h-3.5" aria-hidden="true" />}
            />
          </div>
        </Card>

        {/* Interviewer + notes */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-amber-400" aria-hidden="true" />
            Additional info
          </h3>
          <div className="space-y-4">
            <Input
              label="Interviewer name (optional)"
              value={interviewerName}
              onChange={(e) => setInterviewerName(e.target.value)}
              placeholder="e.g. Sarah Chen"
            />
            <div>
              <label
                htmlFor="interview-notes"
                className="text-xs font-medium text-foreground mb-1.5 block"
              >
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="interview-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any reminders, prep notes, or links…"
                rows={3}
                className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
          </div>
        </Card>

        {/* Inline error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => navigate("/app/interviews")}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            loading={loading}
            disabled={!canSubmit || loading}
            leftIcon={<CalendarDays className="w-4 h-4" aria-hidden="true" />}
          >
            Schedule interview
          </Button>
        </div>
      </form>
    </div>
  );
}
