import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Building2, Clock, Globe,
  User, MessageSquare, CalendarDays,
  ExternalLink, Edit2, Trash2, CheckCircle,
  ClipboardList, FileQuestion,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import { companyProfilePath } from "@/lib/company/slug";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import {
  setupInterviewReminders,
  reminderOutcomeMessage,
} from "@/lib/interviews/scheduleReminders";
import { resolveSchedulerTimezoneKey } from "@/lib/interviews/schedulerTimezone";
import { isInterviewScheduledToday } from "@/lib/interviews/roundHelpers";
import { teardownInterviewSideEffects } from "@/lib/interviews/interviewTeardown";

// ─────────────────────────────────────────────────────────────────
// InterviewDetail — single interview view + prep checklist
// ─────────────────────────────────────────────────────────────────

const PREP_CHECKLIST = [
  "Research the company's recent news and products",
  "Review the job description thoroughly",
  "Prepare 3–5 STAR stories from your experience",
  "Prepare questions to ask the interviewer",
  "Test your audio/video setup",
  "Confirm the meeting link works",
];

export default function InterviewDetail() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const scheduler = useInterviewScheduler();
  const store     = useInterviewSchedulerStore();
  const calendar  = useCalendarSync();

  const [checklist, setChecklist] = useState<boolean[]>(
    PREP_CHECKLIST.map(() => false)
  );
  const [deleting, setDeleting] = useState(false);
  const [retryingReminders, setRetryingReminders] = useState(false);
  const [retryingCalendar, setRetryingCalendar] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (!store.interviews.find((iv) => iv.id === id)) {
      scheduler.reload();
    }
  }, [id]);

  const ivRaw = store.interviews.find((iv) => iv.id === id);
  const iv = ivRaw as any;

  if ((store as any).is_loading) {
    return (
      <PageContent className="max-w-2xl space-y-4">
        <PageHeader
          title="Interview details"
          subtitle="Loading interview…"
          breadcrumbs={[
            { label: "Interviews", href: "/app/interviews" },
            { label: "Details" },
          ]}
        />
        <SkeletonCard />
        <SkeletonCard />
      </PageContent>
    );
  }

  if (store.load_error) {
    return (
      <PageContent className="max-w-2xl space-y-4">
        <PageHeader
          title="Interview details"
          breadcrumbs={[
            { label: "Interviews", href: "/app/interviews" },
            { label: "Details" },
          ]}
        />
        <InlineErrorRetry
          message={store.load_error}
          onRetry={() => scheduler.reload()}
        />
      </PageContent>
    );
  }

  if (!iv) {
    return (
      <PageContent className="max-w-2xl">
        <PageHeader
          title="Interview not found"
          breadcrumbs={[
            { label: "Interviews", href: "/app/interviews" },
            { label: "Not found" },
          ]}
        />
        <Card>
          <EmptyState
            icon={FileQuestion}
            title="Interview not found"
            description="This interview may have been deleted or the link is invalid."
            actionLabel="Back to interviews"
            onAction={() => navigate("/app/interviews")}
            compact
          />
        </Card>
      </PageContent>
    );
  }

  const round = iv.next_round ?? iv.rounds?.[0] ?? null;
  const scheduledAt = round?.scheduled_at ?? iv.scheduled_at ?? iv.created_at;
  const d         = new Date(scheduledAt);
  const isNow     = isInterviewScheduledToday(iv);
  const isPassed  = isPast(d) && !isNow;
  const calendarSyncStatus = String(iv.calendar_sync_status ?? "");
  const calendarSyncError = String(iv.calendar_sync_error ?? "").trim();
  const calendarEventId = (iv as { calendar_event_id?: string | null }).calendar_event_id;
  const ivStatus =
    iv.status === "cancelled"
      ? "cancelled"
      : iv.status === "completed"
        ? "completed"
        : (round?.status ?? iv.status ?? "scheduled");

  async function handleRetryReminders() {
    if (!round?.scheduled_at) {
      toast.error("Add a scheduled time before setting up reminders.");
      return;
    }
    setRetryingReminders(true);
    try {
      const timezone = resolveSchedulerTimezoneKey(round.timezone, iv.timezone);
      const outcome = await setupInterviewReminders({
        interviewId: iv.id,
        company: iv.company_name,
        role: iv.role_title,
        scheduledAt: new Date(round.scheduled_at).toISOString(),
        timezone,
      });
      if (outcome.status === "success") {
        toast.success(reminderOutcomeMessage(outcome));
      } else {
        toast.error(reminderOutcomeMessage(outcome));
      }
    } finally {
      setRetryingReminders(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const teardown = await teardownInterviewSideEffects(
        {
          interviewId: iv.id,
          companyName: iv.company_name,
          roleTitle: iv.role_title,
          calendarEventId,
        },
        {
          calendarSyncAvailable: calendar.syncAvailable,
          calendarConnected: calendar.isConnected,
          deleteCalendarEvent: calendar.deleteEvent,
        },
      );
      if (teardown.calendarWarning) toast.message(teardown.calendarWarning);
      await scheduler.deleteInterview(iv.id);
      navigate("/app/interviews");
    } catch (err) {
      console.error("handleDelete failed:", err);
      toast.error("Failed to delete interview. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRetryCalendarSync() {
    if (!round?.scheduled_at) {
      toast.error("Add a scheduled time before syncing to calendar.");
      return;
    }
    if (!calendar.syncAvailable) {
      toast.info("Google Calendar sync isn't configured on this deployment.");
      return;
    }
    setRetryingCalendar(true);
    try {
      const timezone = resolveSchedulerTimezoneKey(round.timezone, iv.timezone);
      const start = new Date(round.scheduled_at);
      const durationMinutes = round.duration_minutes ?? iv.duration_minutes ?? 60;
      const end = new Date(start.getTime() + durationMinutes * 60_000);
      const wrote = await calendar.writeEvent({
        interviewId: iv.id,
        summary: `Interview: ${iv.company_name}`,
        description: iv.role_title,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        timeZone: timezone === "local" ? undefined : timezone,
        location: round.meeting_link ?? iv.meeting_link ?? undefined,
        eventId: calendarEventId ?? undefined,
      });
      if (wrote.error) {
        if (wrote.code === "REAUTH_REQUIRED") {
          toast.error("Reconnect Google Calendar in Settings → Integrations.");
        } else {
          toast.error(wrote.error);
        }
      } else {
        toast.success("Calendar event synced.");
        await scheduler.reload();
      }
    } finally {
      setRetryingCalendar(false);
    }
  }

  async function handleComplete() {
    try {
      if (round?.id) {
        await scheduler.updateRound(round.id, {
          status: "completed",
        } as any);
      }
      await scheduler.updateInterview(iv.id, { status: "completed" } as any);
      toast.success("Interview marked completed.");
      await scheduler.reload();
    } catch (err) {
      console.error("handleComplete failed:", err);
      toast.error("Failed to mark interview as completed. Please try again.");
    }
  }

  async function handleCancel() {
    try {
      if (round?.id) {
        await scheduler.updateRound(round.id, {
          status: "cancelled",
        } as any);
      }
      await scheduler.updateInterview(iv.id, { status: "cancelled" } as any);
      void fetchEdgeJson("schedule-interview", {
        action: "cancel",
        interview_id: iv.id,
        company_name: iv.company_name,
        role_title: iv.role_title,
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }).catch(() => undefined);
      if (calendar.syncAvailable && calendar.isConnected) {
        const calResult = await calendar.deleteEvent({
          interviewId: iv.id,
          eventId: (iv as { calendar_event_id?: string }).calendar_event_id,
        });
        if (calResult.error) {
          toast.message(
            calResult.code === "REAUTH_REQUIRED"
              ? "Interview cancelled. Reconnect Google Calendar to cancel the calendar event."
              : "Interview cancelled. The Google Calendar event could not be updated.",
          );
        }
      }
      toast.success("Interview cancelled. It remains in your history.");
      await scheduler.reload();
    } catch (err) {
      console.error("handleCancel failed:", err);
      toast.error("Failed to cancel interview. Please try again.");
    }
  }

  return (
    <PageContent className="max-w-2xl space-y-5">
      <PageHeader
        title={iv.company_name}
        subtitle={iv.role_title}
        breadcrumbs={[
          { label: "Interviews", href: "/app/interviews" },
          { label: iv.company_name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {!isPassed && ivStatus === "scheduled" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleComplete()}
                leftIcon={<CheckCircle className="w-3.5 h-3.5" />}
              >
                Mark completed
              </Button>
            )}
            {ivStatus === "scheduled" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleCancel()}
              >
                Cancel interview
              </Button>
            )}
            {ivStatus === "scheduled" && round?.scheduled_at && new Date(round.scheduled_at).getTime() > Date.now() && (
              <Button
                variant="ghost"
                size="sm"
                loading={retryingReminders}
                onClick={() => void handleRetryReminders()}
              >
                Retry reminders
              </Button>
            )}
            {calendar.syncAvailable &&
              (calendarSyncStatus === "sync_error" || calendarSyncStatus === "reauth_required") && (
              <Button
                variant="ghost"
                size="sm"
                loading={retryingCalendar}
                onClick={() => void handleRetryCalendarSync()}
              >
                Retry calendar sync
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/app/interviews/${iv.id}/edit`)}
              leftIcon={<Edit2 className="w-3.5 h-3.5" />}
            >
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deleting}
              onClick={handleDelete}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete
            </Button>
          </div>
        }
      />

      {/* Today banner */}
      {isNow && (
        <div
          onClick={() => navigate("/app/interview-day")}
          className="flex items-center gap-4 p-4 bg-primary/20 border border-primary/40 rounded-2xl cursor-pointer hover:bg-primary/25 transition-all"
        >
          <div className="text-2xl">🎯</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">This interview is today!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter focus mode for final prep and Practice Coach.
            </p>
          </div>
          <Button variant="primary" size="sm">
            Focus mode →
          </Button>
        </div>
      )}

      {/* Main card */}
      <Card>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
              Interview
            </p>
            <p className="text-muted-foreground text-sm mt-0.5">{iv.role_title}</p>
          </div>
          <Badge
            variant={
              ivStatus === "completed" ? "emerald" :
              ivStatus === "cancelled" ? "red"     :
              isNow                     ? "violet"  : "default"
            }
            size="md"
            dot
          >
            {isNow ? "Today" : ivStatus}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            {
              icon: <CalendarDays className="w-4 h-4 text-primary" />,
              label: "Date & time",
              value: format(d, "EEEE, MMMM d · h:mm a"),
            },
            {
              icon: <Clock className="w-4 h-4 text-blue-400" />,
              label: "Duration",
              value: round?.duration_minutes ? `${round.duration_minutes} minutes` : iv.duration_minutes ? `${iv.duration_minutes} minutes` : "—",
            },
            {
              icon: <ClipboardList className="w-4 h-4 text-emerald-400" />,
              label: "Type & round",
              value: `${round?.interview_type ?? iv.interview_type ?? "Interview"} · Round ${round?.round_number ?? iv.round_number ?? 1}`,
            },
            {
              icon: <Globe className="w-4 h-4 text-amber-400" />,
              label: "Platform",
              value: (round?.platform ?? iv.platform) ? (round?.platform ?? iv.platform).replace("_", " ") : "—",
            },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-accent/5 rounded-lg flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {item.label}
                </p>
                <p className="text-sm text-foreground mt-0.5 capitalize">{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {(calendarSyncStatus || calendarEventId) && (
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center gap-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest w-full">
              Google Calendar
            </p>
            <Badge
              variant={
                calendarSyncStatus === "synced"
                  ? "emerald"
                  : calendarSyncStatus === "reauth_required"
                    ? "amber"
                    : calendarSyncStatus === "sync_error"
                      ? "red"
                      : "default"
              }
              size="sm"
            >
              {calendarSyncStatus === "synced"
                ? "Synced"
                : calendarSyncStatus === "reauth_required"
                  ? "Reconnect required"
                  : calendarSyncStatus === "sync_error"
                    ? "Sync failed"
                    : calendarSyncStatus || "Not synced"}
            </Badge>
            {calendarSyncError && (
              <p className="text-xs text-muted-foreground w-full">{calendarSyncError}</p>
            )}
            {calendarSyncStatus === "reauth_required" && calendar.syncAvailable && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/app/settings/integrations")}
              >
                Reconnect in Settings
              </Button>
            )}
          </div>
        )}

        {/* Interviewer */}
        {(round?.interviewer_name ?? iv.interviewer_name) && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Interviewer</p>
              <p className="text-sm text-foreground">{round?.interviewer_name ?? iv.interviewer_name}</p>
            </div>
          </div>
        )}

        {/* Meeting link */}
        {(round?.meeting_link ?? iv.meeting_link) && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground truncate">{round?.meeting_link ?? iv.meeting_link}</p>
            </div>
            <a
              href={round?.meeting_link ?? iv.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:text-primary/80 transition-colors shrink-0 ml-2"
            >
              Open ↗
            </a>
          </div>
        )}

        {/* Notes */}
        {iv.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">
              Notes
            </p>
            <p className="text-sm text-foreground leading-relaxed">{iv.notes}</p>
          </div>
        )}
      </Card>

      {/* Prep checklist */}
      {!isPassed && (
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Pre-interview checklist
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Note: Checklist items are for quick session prep and reset when you navigate away.
          </p>
          <div className="space-y-2">
            {PREP_CHECKLIST.map((item, i) => (
              <button
                key={i}
                onClick={() =>
                  setChecklist((p) => {
                    const next = [...p];
                    next[i] = !next[i];
                    return next;
                  })
                }
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-accent/5 transition-all text-left group"
              >
                <div className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                  checklist[i]
                    ? "bg-emerald-500 border-emerald-500"
                    : "border-border group-hover:border-primary/40"
                )}>
                  {checklist[i] && (
                    <CheckCircle className="w-3 h-3 text-foreground" />
                  )}
                </div>
                <span className={cn(
                  "text-xs",
                  checklist[i] ? "text-muted-foreground line-through" : "text-foreground"
                )}>
                  {item}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{
                  width: `${(checklist.filter(Boolean).length / checklist.length) * 100}%`,
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {checklist.filter(Boolean).length}/{checklist.length}
            </span>
          </div>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Card
          hover
          onClick={() => navigate(`/app/mock?company=${iv.company_name}`)}
          className="flex items-center gap-3"
        >
          <ClipboardList className="w-5 h-5 text-blue-400 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">Mock session</p>
            <p className="text-[10px] text-muted-foreground">Practice for this interview</p>
          </div>
        </Card>
        <Card
          hover
          onClick={() => {
            if (!iv.company_name) return;
            navigate(companyProfilePath(iv.company_name));
          }}
          className="flex items-center gap-3"
        >
          <Building2 className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">Company research</p>
            <p className="text-[10px] text-muted-foreground">AI brief for {iv.company_name}</p>
          </div>
        </Card>
      </div>
    </PageContent>
  );
}
