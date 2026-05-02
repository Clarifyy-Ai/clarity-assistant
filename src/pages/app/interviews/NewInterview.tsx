// @ts-nocheck
import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// NewInterview — schedule a new interview
//
// Two-step persistence:
//   1) createInterview()  → row in `scheduled_interviews` (parent)
//   2) addRound()         → row in `interview_rounds` (date/platform/etc.)
//
// If Google Calendar is connected, fire-and-forget a sync so the new
// event flows into the user's calendar.
// ─────────────────────────────────────────────────────────────────

const INTERVIEW_TYPES = [
  "Phone Screen", "Technical", "Behavioural",
  "System Design", "HR/Culture Fit", "Final Round", "Other",
];

const PLATFORMS = [
  { value: "zoom",         label: "Zoom"          },
  { value: "google_meet",  label: "Google Meet"   },
  { value: "teams",        label: "MS Teams"      },
  { value: "phone",        label: "Phone call"    },
  { value: "onsite",       label: "In person"     },
  { value: "other",        label: "Other"         },
];

const ROUND_NUMBERS = [1, 2, 3, 4, 5];

// Map UI interview-type label → backend InterviewType slug used by RoundFormValues.
function toInterviewTypeSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s*\/\s*/g, "_")
    .replace(/\s+/g, "_");
}

// Map UI interview-type → InterviewStage on the parent record so the
// pipeline kanban shows the right column from day one.
function toStageFromType(label: string): string {
  switch (label) {
    case "Phone Screen":   return "phone_screen";
    case "Technical":
    case "System Design":  return "technical_round";
    case "Final Round":    return "final_round";
    default:               return "applied";
  }
}

export default function NewInterview() {
  const navigate  = useNavigate();
  const scheduler = useInterviewScheduler();
  const calendar  = useCalendarSync();

  const [company,       setCompany]       = useState("");
  const [roleTitle,     setRoleTitle]     = useState("");
  const [interviewType, setInterviewType] = useState("Behavioural");
  const [platform,      setPlatform]      = useState("zoom");
  const [scheduledAt,   setScheduledAt]   = useState("");
  const [duration,      setDuration]      = useState(45);
  const [roundNumber,   setRoundNumber]   = useState(1);
  const [interviewerName, setInterviewerName] = useState("");
  const [meetingLink,   setMeetingLink]   = useState("");
  const [notes,         setNotes]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const canSubmit = company.trim() && roleTitle.trim() && scheduledAt;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    // 1) Create the parent scheduled_interviews row.
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
      setLoading(false);
      const msg = createErr ?? "Failed to schedule interview";
      setError(msg);
      toast.error(msg);
      return;
    }

    // 2) Attach the round (date, platform, interviewer).
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
      // Parent saved, round failed — non-fatal, user can add round later.
      toast.warning("Interview saved, but the round details failed: " + roundErr);
    } else {
      toast.success("Interview scheduled");
    }

    // 3) Fire-and-forget calendar sync if connected.
    if (calendar.isConnected) {
      calendar.syncNow().then(({ imported, error }) => {
        if (error) toast.error("Calendar sync failed: " + error);
        else if (imported > 0) toast.message(`Synced ${imported} calendar event${imported === 1 ? "" : "s"}`);
      });
    }

    setLoading(false);
    navigate("/app/interviews");
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/app/interviews")}
          className="p-2 rounded-xl bg-accent/5 hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <PageHeader
          title="Schedule interview"
          subtitle="Add a new interview to your tracker"
          className="mb-0"
        />
      </div>

      {!calendar.isCheckingConnection && (
        <Card className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2 text-xs">
            <CalendarDays className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">
              Google Calendar:{" "}
              <span className={calendar.isConnected ? "text-emerald-400" : "text-muted-foreground"}>
                {calendar.isConnected ? "Connected — new interviews auto-sync" : "Not connected"}
              </span>
            </span>
          </div>
          {!calendar.isConnected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => calendar.connectGoogle()}
            >
              Connect
            </Button>
          )}
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Company + role */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-400" />
            Company & Role
          </h3>
          <div className="space-y-4">
            <Input
              label="Company name"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Google"
              required
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

        {/* Type + round */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-4">Interview details</h3>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Interview type</p>
              <div className="flex flex-wrap gap-2">
                {INTERVIEW_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setInterviewType(t)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                      interviewType === t
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-foreground mb-2">Round number</p>
              <div className="flex gap-2">
                {ROUND_NUMBERS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoundNumber(r)}
                    className={cn(
                      "w-9 h-9 rounded-xl border text-xs font-bold transition-all",
                      roundNumber === r
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground"
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
            <Clock className="w-4 h-4 text-blue-400" />
            Schedule
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-foreground mb-1.5">Date & time</p>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
                className="w-full bg-background border border-input text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-foreground mb-2">Duration (minutes)</p>
              <div className="flex gap-2">
                {[30, 45, 60, 90, 120].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={cn(
                      "flex-1 py-2 rounded-xl border text-xs font-medium transition-all",
                      duration === d
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground"
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
            <Globe className="w-4 h-4 text-emerald-400" />
            Platform
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlatform(p.value)}
                  className={cn(
                    "py-2.5 px-3 rounded-xl border text-xs font-medium transition-all",
                    platform === p.value
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
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
              leftIcon={<LinkIcon className="w-3.5 h-3.5" />}
            />
          </div>
        </Card>

        {/* Interviewer + notes */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-amber-400" />
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
              <p className="text-xs font-medium text-foreground mb-1.5">Notes (optional)</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any reminders, prep notes, or links…"
                rows={3}
                className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>
          </div>
        </Card>

        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => navigate("/app/interviews")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            loading={loading}
            disabled={!canSubmit}
            leftIcon={<CalendarDays className="w-4 h-4" />}
          >
            Schedule interview
          </Button>
        </div>
      </form>
    </div>
  );
}
