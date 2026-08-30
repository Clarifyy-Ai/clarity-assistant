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
import { useNavigate, useParams } from "react-router-dom";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { useDocuments } from "@/hooks/useDocuments";
import { useDocumentStore } from "@/store/documentStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  CalendarDays, Building2, Clock,
  User, ChevronLeft,
  Globe, Link as LinkIcon,
  AlertCircle, X, FileText, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";

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

function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildHalfHourSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

function combineSchedule(date: string, time: string, zoneOrOffset: string): Date | null {
  if (!date || !time) return null;
  if (zoneOrOffset === "local") {
    const parsed = new Date(`${date}T${time}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  // Fixed offset form (+05:30 / Z)
  if (zoneOrOffset === "Z" || /^[+-]\d{2}:\d{2}$/.test(zoneOrOffset)) {
    const parsed = new Date(`${date}T${time}:00${zoneOrOffset}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  // IANA zone — build wall time in that zone via Intl when available
  try {
    const probe = new Date(`${date}T${time}:00`);
    if (Number.isNaN(probe.getTime())) return null;
    // Store as absolute Instant approximating the selected wall clock in the zone.
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zoneOrOffset,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    // Fallback: treat as local if formatter rejects the zone
    fmt.format(probe);
    return probe;
  } catch {
    const parsed = new Date(`${date}T${time}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}

function looksLikePlaceholderName(value: string): boolean {
  const t = value.trim();
  if (t.length < 3) return true;
  // Reject digit-only / letter-spam placeholders like "5555" or "TTTTTT"
  if (/^\d+$/.test(t)) return true;
  if (/^(.)\1{2,}$/i.test(t)) return true;
  if (!/[a-zA-Z]/.test(t)) return true;
  const stubs = new Set([
    "test",
    "testing",
    "asdf",
    "qwerty",
    "xxx",
    "xyz",
    "abc",
    "n/a",
    "na",
    "none",
    "null",
    "company",
    "role",
  ]);
  if (stubs.has(t.toLowerCase())) return true;
  return false;
}

const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (India)", offset: "+05:30" },
  { value: "UTC", label: "UTC", offset: "Z" },
  { value: "America/New_York", label: "America/New_York", offset: "local" },
  { value: "Europe/London", label: "Europe/London", offset: "local" },
  { value: "local", label: "Local browser time", offset: "local" },
] as const;

function getDefaultTimeSlot(date: string): string {
  const now = new Date();
  const isToday = date === todayDateString();
  const slots = buildHalfHourSlots();

  if (!isToday) return "09:00";

  const mins = now.getHours() * 60 + now.getMinutes();
  const next = slots.find((slot) => {
    const [h, m] = slot.split(":").map(Number);
    return h * 60 + m > mins;
  });
  return next ?? slots[slots.length - 1];
}

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

function fromInterviewTypeSlug(slug: string): string {
  const match = INTERVIEW_TYPES.find((t) => toInterviewTypeSlug(t) === slug);
  return match ?? "Other";
}

function formatDateInput(iso: string | null | undefined): string {
  if (!iso) return todayDateString();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayDateString();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeInput(iso: string | null | undefined): string {
  if (!iso) return "09:00";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "09:00";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ─── COMPONENT ─────────────────────────────────────────────────────────── */

export default function NewInterview() {
  const navigate  = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const isEditMode = Boolean(editId);
  const scheduler = useInterviewScheduler();
  const interviewStore = useInterviewSchedulerStore();
  const calendar  = useCalendarSync();
  useDocuments();
  const resumes = useDocumentStore((s) => s.resumes);
  const jds = useDocumentStore((s) => s.jds);
  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const activeJdId = useDocumentStore((s) => s.active_jd_id);

  const editingInterview = useMemo(
    () => (editId ? interviewStore.interviews.find((iv) => iv.id === editId) : undefined),
    [editId, interviewStore.interviews],
  );
  const editingRound = editingInterview?.next_round ?? editingInterview?.rounds?.[0] ?? null;

  // ✅ FIX: Mounted ref so we never call toast/setState after navigate() unmounts us
  const mountedRef = useRef(true);
  const prefilledRef = useRef(false);
  const roundPrefilledRef = useRef(false);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (isEditMode && editId && !interviewStore.interviews.find((iv) => iv.id === editId)) {
      void scheduler.reload();
    }
  }, [isEditMode, editId, interviewStore.interviews, scheduler]);

  const [company,         setCompany]         = useState("");
  const [roleTitle,       setRoleTitle]        = useState("");
  const [interviewType,   setInterviewType]    = useState("Behavioural");
  const [platform,        setPlatform]         = useState("zoom");
  const [scheduleDate,    setScheduleDate]      = useState(todayDateString());
  const [scheduleTime,    setScheduleTime]      = useState(() => getDefaultTimeSlot(todayDateString()));
  const [timeZoneKey,     setTimeZoneKey]       = useState<(typeof TIMEZONE_OPTIONS)[number]["value"]>("local");
  const [resumeId,        setResumeId]          = useState<string | null>(activeResumeId);
  const [jdId,            setJdId]              = useState<string | null>(activeJdId);
  const [duration,        setDuration]         = useState(45);
  const [roundNumber,     setRoundNumber]      = useState(1);
  const [interviewerName, setInterviewerName]  = useState("");
  const [meetingLink,     setMeetingLink]      = useState("");
  const [notes,           setNotes]            = useState("");
  const [loading,         setLoading]          = useState(false);
  const [error,           setError]            = useState<string | null>(null);
  // ✅ FIX: Calendar not-connected banner dismiss state
  const [calendarBannerDismissed, setCalendarBannerDismissed] = useState(false);

  useEffect(() => {
    setResumeId(activeResumeId);
  }, [activeResumeId]);

  useEffect(() => {
    setJdId(activeJdId);
  }, [activeJdId]);

  useEffect(() => {
    if (!isEditMode || !editingInterview) return;
    // Prefill parent fields once; allow a second pass when round data arrives later
    // (store hydrate race — DevTools focus used to mask this by triggering reload).
    if (!prefilledRef.current) {
      setCompany(editingInterview.company_name ?? "");
      setRoleTitle(editingInterview.role_title ?? "");
      setNotes(editingInterview.notes ?? "");
      setResumeId(editingInterview.resume_id ?? null);
      setJdId(editingInterview.jd_id ?? null);
      prefilledRef.current = true;
    }

    if (editingRound && !roundPrefilledRef.current) {
      setInterviewType(fromInterviewTypeSlug(editingRound.interview_type ?? "behavioural"));
      setRoundNumber(editingRound.round_number ?? 1);
      setScheduleDate(formatDateInput(editingRound.scheduled_at));
      setScheduleTime(formatTimeInput(editingRound.scheduled_at));
      setDuration(editingRound.duration_minutes ?? 45);
      setInterviewerName(editingRound.interviewer_name ?? "");
      setMeetingLink(editingRound.meeting_link ?? "");
      setPlatform(editingRound.platform ?? "zoom");
      // Restore timezone from stored ISO offset when possible.
      try {
        const iso = editingRound.scheduled_at ?? "";
        if (iso.endsWith("Z") || /[+-]00:00$/.test(iso)) setTimeZoneKey("UTC");
        else if (/[+-]05:30$/.test(iso)) setTimeZoneKey("Asia/Kolkata");
        else setTimeZoneKey("local");
      } catch {
        setTimeZoneKey("local");
      }
      roundPrefilledRef.current = true;
    }
  }, [isEditMode, editingInterview, editingRound, editId]);

  const minDate = todayDateString();
  const timeSlots = useMemo(() => {
    const all = buildHalfHourSlots();
    if (scheduleDate !== minDate) return all;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    return all.filter((slot) => {
      const [h, m] = slot.split(":").map(Number);
      return h * 60 + m > mins;
    });
  }, [scheduleDate, minDate]);

  useEffect(() => {
    if (timeSlots.length > 0 && !timeSlots.includes(scheduleTime)) {
      setScheduleTime(timeSlots[0]);
    }
  }, [timeSlots, scheduleTime]);

  const timeZoneOffset = useMemo(() => {
    const opt = TIMEZONE_OPTIONS.find((z) => z.value === timeZoneKey);
    if (!opt) return "local";
    if (opt.offset !== "local") return opt.offset;
    if (opt.value === "local") return "local";
    // Pass canonical IANA id for zones without a fixed offset in the picker.
    return opt.value;
  }, [timeZoneKey]);

  const scheduledAtIso = useMemo(() => {
    const dt = combineSchedule(scheduleDate, scheduleTime, timeZoneOffset);
    return dt?.toISOString() ?? "";
  }, [scheduleDate, scheduleTime, timeZoneOffset]);

  const canSubmit = useMemo(
    () => {
      const dt = combineSchedule(scheduleDate, scheduleTime, timeZoneOffset);
      const originalIso = editingRound?.scheduled_at
        ? new Date(editingRound.scheduled_at).toISOString()
        : null;
      const unchangedSchedule =
        isEditMode &&
        originalIso &&
        scheduledAtIso &&
        new Date(scheduledAtIso).getTime() === new Date(originalIso).getTime();
      const scheduleValid = Boolean(
        scheduleDate &&
          scheduleTime &&
          dt &&
          (unchangedSchedule || dt.getTime() > Date.now()),
      );
      return Boolean(
        company.trim() &&
          roleTitle.trim() &&
          !looksLikePlaceholderName(company) &&
          !looksLikePlaceholderName(roleTitle) &&
          scheduleValid,
      );
    },
    [
      company,
      roleTitle,
      scheduleDate,
      scheduleTime,
      timeZoneOffset,
      isEditMode,
      editingRound?.scheduled_at,
      scheduledAtIso,
    ],
  );

  const validationMessage = useMemo(() => {
    if (!company.trim()) return "Company name is required.";
    if (looksLikePlaceholderName(company)) {
      return "Enter a real company name (not numbers or placeholders).";
    }
    if (!roleTitle.trim()) return "Role or position is required.";
    if (looksLikePlaceholderName(roleTitle)) {
      return "Enter a real role or position title.";
    }
    if (!scheduleDate || !scheduleTime) return "Choose an interview date and time.";
    const originalIso = editingRound?.scheduled_at
      ? new Date(editingRound.scheduled_at).toISOString()
      : null;
    const unchangedSchedule =
      isEditMode &&
      originalIso &&
      scheduledAtIso &&
      new Date(scheduledAtIso).getTime() === new Date(originalIso).getTime();
    if (!unchangedSchedule && scheduleDate < todayDateString()) {
      return "Interview date is in the past — choose today or a future date.";
    }
    if (!scheduledAtIso) return "Choose a valid interview date and time.";
    if (!unchangedSchedule && new Date(scheduledAtIso).getTime() <= Date.now()) {
      if (scheduleDate === todayDateString()) {
        return "Interview time is in the past — choose a later time today.";
      }
      return "Choose a future interview time.";
    }
    return null;
  }, [
    company,
    roleTitle,
    scheduleDate,
    scheduleTime,
    scheduledAtIso,
    isEditMode,
    editingRound?.scheduled_at,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) {
      setError(validationMessage ?? "Complete the required fields before scheduling.");
      return;
    }

    setLoading(true);
    setError(null);

    if (isEditMode && editId && editingRound) {
      const { error: updateErr } = await scheduler.updateInterview(editId, {
        company_name: company.trim(),
        role_title: roleTitle.trim(),
        stage: toStageFromType(interviewType),
        notes: notes.trim(),
        resume_id: resumeId,
        jd_id: jdId,
        is_remote: platform !== "onsite",
      });

      if (updateErr) {
        if (mountedRef.current) {
          setError(updateErr);
          setLoading(false);
        }
        toast.error(updateErr);
        return;
      }

      const { error: roundErr } = await scheduler.updateRound(editingRound.id, {
        round_number: roundNumber,
        round_label: `Round ${roundNumber} — ${interviewType}`,
        interview_type: toInterviewTypeSlug(interviewType),
        scheduled_at: scheduledAtIso,
        duration_minutes: duration,
        interviewer_name: interviewerName.trim(),
        platform,
        meeting_link: meetingLink.trim(),
      });

      if (roundErr) {
        toast.warning(`Interview updated, but round details failed: ${roundErr}`);
      } else {
        toast.success("Interview updated!");
      }

      navigate(`/app/interviews/${editId}`);
      return;
    }

    // Edit with no round yet — update parent and attach the first round (never create a duplicate interview).
    if (isEditMode && editId) {
      const { error: updateErr } = await scheduler.updateInterview(editId, {
        company_name: company.trim(),
        role_title: roleTitle.trim(),
        stage: toStageFromType(interviewType),
        notes: notes.trim(),
        resume_id: resumeId,
        jd_id: jdId,
        is_remote: platform !== "onsite",
      });
      if (updateErr) {
        if (mountedRef.current) {
          setError(updateErr);
          setLoading(false);
        }
        toast.error(updateErr);
        return;
      }
      const { error: roundErr } = await scheduler.addRound(editId, {
        round_number: roundNumber,
        round_label: `Round ${roundNumber} — ${interviewType}`,
        interview_type: toInterviewTypeSlug(interviewType),
        scheduled_at: scheduledAtIso,
        duration_minutes: duration,
        interviewer_name: interviewerName.trim(),
        interviewer_title: "",
        platform,
        meeting_link: meetingLink.trim(),
        notes: "",
      });
      if (roundErr) {
        toast.warning(`Interview saved, but round details failed: ${roundErr}`);
      } else {
        toast.success("Interview updated!");
      }
      navigate(`/app/interviews/${editId}`);
      return;
    }

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
      resume_id:       resumeId,
      jd_id:           jdId,
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
      scheduled_at:      scheduledAtIso,
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

      try {
        const reminder = await fetchEdgeJson<{
          success?: boolean;
          email_sent?: boolean;
          email_configured?: boolean;
        }>(
          "schedule-interview",
          {
            interview_id: id,
            company_name: company.trim(),
            role_title: roleTitle.trim(),
            scheduled_at: scheduledAtIso,
          }
        );
        if (reminder?.email_sent) {
          toast.message("Email reminder sent to your account address.");
        } else if (reminder?.email_configured === false) {
          toast.message(
            "In-app reminder created. Email reminders are not configured on this environment (requires Resend).",
          );
        } else {
          toast.message(
            "In-app reminder created. Email reminder could not be sent — check notification email preferences.",
          );
        }
      } catch (remErr) {
        console.warn("[NewInterview] schedule-interview:", remErr);
        toast.message("Interview saved. In-app reminder setup failed; email was not sent.");
      }
    }

    // ── Step 3: Calendar sync ─────────────────────────────────────────────
    // ✅ FIX: Await sync BEFORE navigate() so the component is still mounted
    // when we call toast. Previously syncNow() was called after navigate(),
    // which unmounted the component, causing React's "setState on unmounted
    // component" warning and silently dropping the sync result toast.
    if (calendar.syncAvailable && calendar.isConnected) {
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

    // Refresh store before leave so /app/interviews isn't stale.
    await scheduler.reload();

    // ── Navigate (component unmounts after this) ──────────────────────────
    navigate("/app/interviews");
    // No state updates after this line — component is unmounted
  }

  /* ── Calendar banner ─────────────────────────────────────────────────── */

  // Honest UX: when sync isn't configured (501), never show a live Connect CTA.
  const showCalendarComingSoon =
    !calendar.isCheckingConnection &&
    !calendar.isProbingSync &&
    !calendar.syncAvailable &&
    !calendarBannerDismissed;

  const showCalendarBanner =
    !calendar.isCheckingConnection &&
    !calendar.isProbingSync &&
    calendar.syncAvailable &&
    !calendar.isConnected &&
    !calendarBannerDismissed;

  const showCalendarConnected =
    !calendar.isCheckingConnection &&
    calendar.syncAvailable &&
    calendar.isConnected;

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
          title={isEditMode ? "Edit interview" : "Schedule interview"}
          subtitle={isEditMode ? "Update your scheduled interview details" : "Add a new interview to your tracker"}
          className="mb-0"
        />
      </div>

      {/* Calendar not configured — honest coming-soon, not a broken Connect */}
      {showCalendarComingSoon && (
        <Card className="border-border bg-secondary/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Google Calendar — Not configured
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Calendar sync is not configured on this environment yet. You can still schedule interviews in Clarify.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCalendarBannerDismissed(true)}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss calendar banner"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </Card>
      )}

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
            <Building2 className="w-4 h-4 text-primary" aria-hidden="true" />
            Company &amp; Role
          </h3>
          <div className="space-y-4">
            <Input
              label="Company name *"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Google"
              required
              aria-required={true}
              autoFocus
            />
            <Input
              label="Role / position *"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
              required
              aria-required={true}
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
                htmlFor="schedule-date"
                className="text-xs font-medium text-foreground mb-1.5 block"
              >
                Date
              </label>
              <input
                id="schedule-date"
                type="date"
                value={scheduleDate}
                min={minDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                required
                aria-required={true}
                className="w-full bg-background border border-input text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="schedule-time"
                className="text-xs font-medium text-foreground mb-1.5 block"
              >
                Time (30-min intervals)
              </label>
              <select
                id="schedule-time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                required
                aria-required={true}
                className="w-full bg-background border border-input text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              >
                {timeSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="schedule-timezone"
                className="text-xs font-medium text-foreground mb-1.5 block"
              >
                Timezone
              </label>
              <select
                id="schedule-timezone"
                value={timeZoneKey}
                onChange={(e) =>
                  setTimeZoneKey(e.target.value as (typeof TIMEZONE_OPTIONS)[number]["value"])
                }
                className="w-full bg-background border border-input text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              >
                {TIMEZONE_OPTIONS.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
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

        {/* Linked documents */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
            Linked documents
          </h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="linked-jd" className="text-xs font-medium text-foreground mb-1.5 block">
                Job description (optional)
              </label>
              <select
                id="linked-jd"
                value={jdId ?? ""}
                onChange={(e) => setJdId(e.target.value || null)}
                className="w-full bg-background border border-input text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              >
                <option value="">No JD linked</option>
                {jds.map((jd) => (
                  <option key={jd.id} value={jd.id}>
                    {jd.title || jd.company || jd.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="linked-resume" className="text-xs font-medium text-foreground mb-1.5 block">
                Resume (optional)
              </label>
              <select
                id="linked-resume"
                value={resumeId ?? ""}
                onChange={(e) => setResumeId(e.target.value || null)}
                className="w-full bg-background border border-input text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              >
                <option value="">No resume linked</option>
                {resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.title || resume.file_name || resume.id}
                  </option>
                ))}
              </select>
            </div>
            {jds.length === 0 && resumes.length === 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                Upload documents in Documents to link them here.
              </p>
            )}
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
            disabled={loading}
            leftIcon={<CalendarDays className="w-4 h-4" aria-hidden="true" />}
          >
            {isEditMode ? "Save changes" : "Schedule interview"}
          </Button>
        </div>
      </form>
    </div>
  );
}
