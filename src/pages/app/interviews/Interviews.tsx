// @ts-nocheck
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useInterviewSchedulerStore } from "@/store/interviewSchedulerStore";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  CalendarDays, Plus, Building2, Clock,
  ChevronRight, CheckCircle, AlertCircle,
  Circle, Filter, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isPast, isToday, isFuture } from "date-fns";

// ─────────────────────────────────────────────────────────────────
// Interviews — full scheduled interview list
// ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ["all", "upcoming", "today", "completed", "cancelled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function Interviews() {
  const navigate   = useNavigate();
  const scheduler  = useInterviewScheduler();
  const store      = useInterviewSchedulerStore();

  const [filter, setFilter] = useState<StatusFilter>("all");

  useEffect(() => { scheduler.reload(); }, []);

  const filtered = store.interviews.filter((iv) => {
    const d = new Date(iv.scheduled_at);
    if (filter === "upcoming")  return isFuture(d) && !isToday(d) && iv.status !== "cancelled";
    if (filter === "today")     return isToday(d);
    if (filter === "completed") return iv.status === "completed";
    if (filter === "cancelled") return iv.status === "cancelled";
    return true;
  });

  // Group by month
  const grouped = filtered.reduce<Record<string, any[]>>((acc, iv) => {
    const key = format(new Date(iv.scheduled_at), "MMMM yyyy");
    if (!acc[key]) acc[key] = [];
    acc[key].push(iv);
    return acc;
  }, {});

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Interviews"
        subtitle="Track and manage your scheduled interviews"
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate("/app/interviews/new")}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Schedule interview
          </Button>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all capitalize",
              filter === f
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f}
            {f === "today" && store.interviews.some(
              (iv) => isToday(new Date(iv.scheduled_at))
            ) && (
              <span className="ml-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {store.isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-16">
          <CalendarDays className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No interviews found.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => navigate("/app/interviews/new")}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Schedule your first interview
          </Button>
        </Card>
      ) : (
        /* Grouped list */
        Object.entries(grouped).map(([month, ivs]) => (
          <div key={month}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              {month}
            </p>
            <div className="space-y-2">
              {ivs.map((iv) => (
                <InterviewRow
                  key={iv.id}
                  interview={iv}
                  onDelete={() => scheduler.deleteInterview(iv.id)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// InterviewRow
// ─────────────────────────────────────────────────────────────────

function InterviewRow({
  interview: iv,
  onDelete,
}: {
  interview: any;
  onDelete:  () => void;
}) {
  const navigate  = useNavigate();
  const d         = new Date(iv.scheduled_at);
  const isNow     = isToday(d);
  const isPassed  = isPast(d) && !isNow;
  const isCancelled = iv.status === "cancelled";

  const statusConfig = {
    scheduled:  { label: "Scheduled",  variant: "violet"  as const, icon: Circle      },
    completed:  { label: "Completed",  variant: "emerald" as const, icon: CheckCircle  },
    cancelled:  { label: "Cancelled",  variant: "red"     as const, icon: AlertCircle  },
    rescheduled:{ label: "Rescheduled",variant: "amber"   as const, icon: Clock        },
  }[iv.status] ?? { label: iv.status, variant: "default" as const, icon: Circle };

  const StatusIcon = statusConfig.icon;

  return (
    <div className={cn(
      "flex items-start gap-4 p-4 rounded-2xl border transition-all group",
      isNow
        ? "bg-violet-600/10 border-violet-500/30"
        : isCancelled
        ? "bg-card border-border opacity-60"
        : "bg-card border-border hover:bg-secondary/60"
    )}>
      {/* Date block */}
      <div className={cn(
        "w-12 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border",
        isNow
          ? "bg-violet-600 border-violet-500"
          : "bg-accent/5 border-border"
      )}>
        <p className={cn(
          "text-[10px] font-semibold uppercase",
          isNow ? "text-violet-200" : "text-muted-foreground"
        )}>
          {format(d, "MMM")}
        </p>
        <p className={cn(
          "text-xl font-black leading-none",
          isNow ? "text-foreground" : "text-foreground"
        )}>
          {format(d, "d")}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {iv.company_name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {iv.role_title}
              {iv.interview_type && ` · ${iv.interview_type}`}
            </p>
          </div>
          <Badge variant={statusConfig.variant} size="sm" dot>
            {statusConfig.label}
          </Badge>
        </div>

        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(d, "h:mm a")}
            {iv.duration_minutes && ` · ${iv.duration_minutes}min`}
          </span>
          {iv.interviewer_name && (
            <span>with {iv.interviewer_name}</span>
          )}
          {iv.platform && (
            <span className="capitalize">{iv.platform}</span>
          )}
        </div>

        {/* Notes preview */}
        {iv.notes && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{iv.notes}</p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3">
          {isNow && (
            <Button
              variant="primary"
              size="xs"
              onClick={() => navigate("/app/interview-day")}
            >
              🎯 Enter focus mode
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => navigate(`/app/interviews/${iv.id}`)}
            rightIcon={<ChevronRight className="w-3 h-3" />}
          >
            View details
          </Button>
          {!isNow && iv.status !== "completed" && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => navigate(`/app/mock?company=${iv.company_name}`)}
            >
              Practice now
            </Button>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-400 hover:bg-accent/5 opacity-0 group-hover:opacity-100 transition-all shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
