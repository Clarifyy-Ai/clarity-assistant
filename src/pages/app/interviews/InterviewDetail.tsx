import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  ChevronLeft, Building2, Clock, Globe,
  User, MessageSquare, CalendarDays,
  ExternalLink, Edit2, Trash2, CheckCircle,
  ClipboardList, Brain,
} from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";

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

  const [checklist, setChecklist] = useState<boolean[]>(
    PREP_CHECKLIST.map(() => false)
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (!store.interviews.find((iv) => iv.id === id)) {
      scheduler.fetchInterviews();
    }
  }, [id]);

  const iv = store.interviews.find((iv) => iv.id === id);

  if (store.isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!iv) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-gray-400">Interview not found.</p>
        <Button variant="secondary" size="sm" onClick={() => navigate("/app/interviews")}>
          ← Back
        </Button>
      </div>
    );
  }

  const d         = new Date(iv.scheduled_at);
  const isNow     = isToday(d);
  const isPassed  = isPast(d) && !isNow;

  async function handleDelete() {
    setDeleting(true);
    await scheduler.deleteInterview(iv.id);
    navigate("/app/interviews");
  }

  async function handleComplete() {
    await scheduler.updateInterviewStatus(iv.id, "completed");
  }

  return (
    <div className="max-w-2xl space-y-5">

      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/app/interviews")}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Interviews
        </button>
        <div className="flex items-center gap-2">
          {!isPassed && iv.status === "scheduled" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleComplete}
              leftIcon={<CheckCircle className="w-3.5 h-3.5" />}
            >
              Mark completed
            </Button>
          )}
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
      </div>

      {/* Today banner */}
      {isNow && (
        <div
          onClick={() => navigate("/app/interview-day")}
          className="flex items-center gap-4 p-4 bg-violet-600/20 border border-violet-500/40 rounded-2xl cursor-pointer hover:bg-violet-600/25 transition-all"
        >
          <div className="text-2xl">🎯</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">This interview is today!</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Enter focus mode for final prep and real-time co-pilot.
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
            <h1 className="text-xl font-bold text-white">{iv.company_name}</h1>
            <p className="text-gray-400 text-sm mt-0.5">{iv.role_title}</p>
          </div>
          <Badge
            variant={
              iv.status === "completed" ? "emerald" :
              iv.status === "cancelled" ? "red"     :
              isNow                     ? "violet"  : "default"
            }
            size="md"
            dot
          >
            {isNow ? "Today" : iv.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            {
              icon: <CalendarDays className="w-4 h-4 text-violet-400" />,
              label: "Date & time",
              value: format(d, "EEEE, MMMM d · h:mm a"),
            },
            {
              icon: <Clock className="w-4 h-4 text-blue-400" />,
              label: "Duration",
              value: iv.duration_minutes ? `${iv.duration_minutes} minutes` : "—",
            },
            {
              icon: <ClipboardList className="w-4 h-4 text-emerald-400" />,
              label: "Type & round",
              value: `${iv.interview_type ?? "Interview"} · Round ${iv.round_number ?? 1}`,
            },
            {
              icon: <Globe className="w-4 h-4 text-amber-400" />,
              label: "Platform",
              value: iv.platform ? iv.platform.replace("_", " ") : "—",
            },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">
                  {item.label}
                </p>
                <p className="text-sm text-white mt-0.5 capitalize">{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Interviewer */}
        {iv.interviewer_name && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/8">
            <User className="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500">Interviewer</p>
              <p className="text-sm text-white">{iv.interviewer_name}</p>
            </div>
          </div>
        )}

        {/* Meeting link */}
        {iv.meeting_link && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/8">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
              <p className="text-xs text-gray-400 truncate">{iv.meeting_link}</p>
            </div>
            <a
              href={iv.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors shrink-0 ml-2"
            >
              Open ↗
            </a>
          </div>
        )}

        {/* Notes */}
        {iv.notes && (
          <div className="mt-4 pt-4 border-t border-white/8">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">
              Notes
            </p>
            <p className="text-sm text-gray-300 leading-relaxed">{iv.notes}</p>
          </div>
        )}
      </Card>

      {/* Prep checklist */}
      {!isPassed && (
        <Card>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Pre-interview checklist
          </h3>
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
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all text-left group"
              >
                <div className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                  checklist[i]
                    ? "bg-emerald-500 border-emerald-500"
                    : "border-white/20 group-hover:border-white/40"
                )}>
                  {checklist[i] && (
                    <CheckCircle className="w-3 h-3 text-white" />
                  )}
                </div>
                <span className={cn(
                  "text-xs",
                  checklist[i] ? "text-gray-500 line-through" : "text-gray-300"
                )}>
                  {item}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{
                  width: `${(checklist.filter(Boolean).length / checklist.length) * 100}%`,
                }}
              />
            </div>
            <span className="text-xs text-gray-500">
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
            <p className="text-xs font-semibold text-white">Mock session</p>
            <p className="text-[10px] text-gray-500">Practise for this interview</p>
          </div>
        </Card>
        <Card
          hover
          onClick={() => navigate(`/app/companies?q=${iv.company_name}`)}
          className="flex items-center gap-3"
        >
          <Building2 className="w-5 h-5 text-violet-400 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-white">Company research</p>
            <p className="text-[10px] text-gray-500">AI brief for {iv.company_name}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
