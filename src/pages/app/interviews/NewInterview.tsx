// @ts-nocheck
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  CalendarDays, Building2, Clock,
  User, MessageSquare, ChevronLeft,
  Globe, Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// NewInterview — schedule a new interview
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
  { value: "in_person",   label: "In person"     },
  { value: "other",        label: "Other"         },
];

const ROUND_NUMBERS = [1, 2, 3, 4, 5];

export default function NewInterview() {
  const navigate  = useNavigate();
  const scheduler = useInterviewScheduler();

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

    const { error: err } = await scheduler.createInterview({
      company_name:     company.trim(),
      role_title:       roleTitle.trim(),
      interview_type:   interviewType,
      platform,
      scheduled_at:     new Date(scheduledAt).toISOString(),
      duration_minutes: duration,
      round_number:     roundNumber,
      interviewer_name: interviewerName.trim() || null,
      meeting_link:     meetingLink.trim() || null,
      notes:            notes.trim() || null,
    });

    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate("/app/interviews");
    }
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
            {/* Type */}
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
                        ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                        : "bg-white/3 border-white/10 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Round */}
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
                        ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                        : "bg-white/3 border-white/10 text-muted-foreground hover:text-foreground"
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
              <p className="text-xs font-medium text-foreground mb-1.5">
                Date & time
              </p>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
                className="w-full bg-black/30 border border-white/10 text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500 [color-scheme:dark]"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-foreground mb-2">
                Duration (minutes)
              </p>
              <div className="flex gap-2">
                {[30, 45, 60, 90, 120].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={cn(
                      "flex-1 py-2 rounded-xl border text-xs font-medium transition-all",
                      duration === d
                        ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                        : "bg-white/3 border-white/10 text-muted-foreground hover:text-foreground"
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
                      ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                      : "bg-white/3 border-white/10 text-muted-foreground hover:text-foreground"
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
              <p className="text-xs font-medium text-foreground mb-1.5">
                Notes (optional)
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any reminders, prep notes, or links…"
                rows={3}
                className="w-full bg-black/30 border border-white/10 text-foreground placeholder-gray-600 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-violet-500"
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
