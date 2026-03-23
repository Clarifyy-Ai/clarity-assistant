// @ts-nocheck
import { useState } from "react";
import { useInterviewScheduler } from "@/hooks/useInterviewScheduler";
import { useNavigate } from "react-router-dom";
import {
  Calendar, Plus, ChevronRight, Clock, MapPin,
  Video, Briefcase, Star, Trash2, Edit3,
  ArrowRight, CheckCircle, XCircle, AlertCircle,
  Loader2, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  InterviewStage,
  InterviewFormValues,
} from "@/types/interview.types";

// ─────────────────────────────────────────────────────────────────
// InterviewScheduler
// Kanban pipeline + calendar view for tracking real interviews.
// ─────────────────────────────────────────────────────────────────

const STAGES: { value: InterviewStage; label: string; color: string }[] = [
  { value: "applied",    label: "Applied",     color: "bg-gray-500/20 border-gray-500/30" },
  { value: "screening",  label: "Screening",   color: "bg-blue-500/20 border-blue-500/30" },
  { value: "interview",  label: "Interview",   color: "bg-violet-500/20 border-violet-500/30" },
  { value: "final",      label: "Final Round", color: "bg-amber-500/20 border-amber-500/30" },
  { value: "offer",      label: "Offer",       color: "bg-emerald-500/20 border-emerald-500/30" },
  { value: "rejected",   label: "Rejected",    color: "bg-red-500/20 border-red-500/30" },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-yellow-400",
  low:      "text-muted-foreground",
};

export default function InterviewScheduler() {
  const navigate     = useNavigate();
  const scheduler    = useInterviewScheduler();

  const [activeView,   setActiveView]   = useState<"kanban" | "list">("kanban");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [dragOver,     setDragOver]     = useState<InterviewStage | null>(null);
  const [dragId,       setDragId]       = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────

  const emptyForm: Partial<InterviewFormValues> = {
    company_name: "", role_title: "",
    stage: "applied", priority: "medium",
    is_remote: true,
  };
  const [form, setForm] = useState<Partial<InterviewFormValues>>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving,  setIsSaving]  = useState(false);

  async function handleAdd() {
    if (!form.company_name || !form.role_title) {
      setFormError("Company and role title are required.");
      return;
    }
    setIsSaving(true);
    const { error } = await scheduler.createInterview(form as InterviewFormValues);
    setIsSaving(false);
    if (error) { setFormError(error); return; }
    setAddDialogOpen(false);
    setForm(emptyForm);
    setFormError(null);
  }

  // ── Drag-and-drop ─────────────────────────────────────────────

  function onDragStart(id: string) {
    setDragId(id);
  }

  function onDrop(stage: InterviewStage) {
    if (dragId) {
      scheduler.moveStage(dragId, stage);
      setDragId(null);
    }
    setDragOver(null);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Interview Tracker</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage your active job applications and interview pipeline
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex gap-1 bg-secondary border border-border rounded-xl p-1">
              {(["kanban", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setActiveView(v)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-all",
                    activeView === v ? "bg-violet-600 text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>

            <button
              onClick={() => setAddDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-foreground text-sm font-medium rounded-xl transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Interview
            </button>
          </div>
        </div>

        {/* ── Today's interviews ──────────────────────── */}
        {scheduler.todayInterviews.length > 0 && (
          <div className="bg-gradient-to-r from-violet-600/20 to-purple-600/10 border border-violet-500/30 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Today's Interviews
            </h2>
            <div className="flex flex-wrap gap-3">
              {scheduler.todayInterviews.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-3 bg-secondary rounded-xl px-4 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{i.company_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.next_round?.scheduled_at
                        ? new Date(i.next_round.scheduled_at).toLocaleTimeString([], {
                            hour: "2-digit", minute: "2-digit",
                          })
                        : "Time TBC"}
                      {" · "}{i.next_round?.round_label}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/live/setup?interview=${i.id}`)}
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-foreground text-xs rounded-lg transition-all"
                  >
                    Launch Co-pilot
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            KANBAN VIEW
        ══════════════════════════════════════════════ */}
        {activeView === "kanban" && (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max">
              {STAGES.map((stage) => {
                const column = scheduler.pipelineByStage[stage.value] ?? [];
                return (
                  <div
                    key={stage.value}
                    className={cn(
                      "w-64 rounded-2xl border p-3 flex flex-col gap-3 transition-all",
                      stage.color,
                      dragOver === stage.value && "ring-2 ring-violet-400"
                    )}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(stage.value); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => onDrop(stage.value)}
                  >
                    {/* Column header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {stage.label}
                      </span>
                      <span className="text-xs text-muted-foreground bg-secondary/80 rounded-full px-2 py-0.5">
                        {column.length}
                      </span>
                    </div>

                    {/* Cards */}
                    {column.map((interview) => (
                      <KanbanCard
                        key={interview.id}
                        interview={interview}
                        onDragStart={() => onDragStart(interview.id)}
                        onClick={() => {
                          scheduler.selectInterview(interview.id);
                          navigate(`/scheduler/${interview.id}`);
                        }}
                        onDelete={() => scheduler.deleteInterview(interview.id)}
                        onLaunchCopilot={() =>
                          navigate(`/live/setup?interview=${interview.id}`)
                        }
                      />
                    ))}

                    {column.length === 0 && (
                      <div className="text-center py-6 text-muted-foreground text-xs">
                        Drop here
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            LIST VIEW
        ══════════════════════════════════════════════ */}
        {activeView === "list" && (
          <div className="space-y-3">
            {scheduler.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : scheduler.interviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm">
                <Briefcase className="w-10 h-10 mb-3 text-muted-foreground" />
                No interviews tracked yet
              </div>
            ) : (
              scheduler.interviews.map((interview) => (
                <ListInterviewRow
                  key={interview.id}
                  interview={interview}
                  onDelete={() => scheduler.deleteInterview(interview.id)}
                  onMoveStage={(stage) => scheduler.moveStage(interview.id, stage)}
                  onLaunch={() => navigate(`/live/setup?interview=${interview.id}`)}
                />
              ))
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ADD INTERVIEW DIALOG
        ══════════════════════════════════════════════ */}
        {addDialogOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-popover border border-border rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-foreground">Track New Interview</h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">Company *</label>
                  <input
                    value={form.company_name ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                    placeholder="e.g. Stripe"
                    className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">Role Title *</label>
                  <input
                    value={form.role_title ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, role_title: e.target.value }))}
                    placeholder="e.g. Senior Software Engineer"
                    className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Stage</label>
                  <select
                    value={form.stage}
                    onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as InterviewStage }))}
                    className="w-full bg-secondary border border-border text-foreground rounded-xl px-3 py-2 focus:outline-none focus:border-violet-500 text-sm"
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as any }))}
                    className="w-full bg-secondary border border-border text-foreground rounded-xl px-3 py-2 focus:outline-none focus:border-violet-500 text-sm"
                  >
                    <option value="critical">🔴 Critical</option>
                    <option value="high">🟠 High</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="low">⚪ Low</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">Job Posting URL</label>
                  <input
                    value={form.job_posting_url ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, job_posting_url: e.target.value }))}
                    placeholder="https://…"
                    className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">Notes</label>
                  <textarea
                    value={form.notes ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Recruiter name, salary expectations, special notes…"
                    rows={3}
                    className="w-full bg-secondary border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_remote ?? true}
                  onChange={(e) => setForm((f) => ({ ...f, is_remote: e.target.checked }))}
                  className="rounded border-border bg-secondary text-violet-500"
                />
                <span className="text-sm text-muted-foreground">Remote position</span>
              </label>

              {formError && (
                <p className="text-sm text-red-400">{formError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setAddDialogOpen(false); setFormError(null); }}
                  className="flex-1 py-2.5 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground text-sm rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-foreground text-sm font-medium rounded-xl transition-all"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// KanbanCard
// ─────────────────────────────────────────────────────────────────

function KanbanCard({
  interview, onDragStart, onClick, onDelete, onLaunchCopilot,
}: {
  interview: any; onDragStart: () => void; onClick: () => void;
  onDelete: () => void; onLaunchCopilot: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-card border border-border rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-border transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-foreground leading-snug">{interview.company_name}</p>
        <span className={cn("text-xs shrink-0", PRIORITY_COLORS[interview.priority])}>
          ●
        </span>
      </div>
      <p className="text-xs text-muted-foreground truncate">{interview.role_title}</p>

      {interview.next_round && (
        <div className="flex items-center gap-1 mt-2 text-xs text-violet-300">
          <Clock className="w-3 h-3" />
          {interview.next_round.round_label}
          {interview.next_round.scheduled_at && (
            <> · {new Date(interview.next_round.scheduled_at).toLocaleDateString("en-GB", {
              day: "2-digit", month: "short",
            })}</>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onLaunchCopilot(); }}
          className="text-xs text-emerald-400 hover:text-emerald-300"
        >
          Launch →
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-muted-foreground hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ListInterviewRow
// ─────────────────────────────────────────────────────────────────

function ListInterviewRow({
  interview, onDelete, onMoveStage, onLaunch,
}: {
  interview: any; onDelete: () => void;
  onMoveStage: (stage: InterviewStage) => void;
  onLaunch: () => void;
}) {
  const stage = STAGES.find((s) => s.value === interview.stage);
  return (
    <div className="bg-secondary border border-border hover:border-border rounded-2xl px-5 py-4 flex items-center gap-4 transition-all">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-foreground">{interview.company_name}</p>
          <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize", stage?.color)}>
            {stage?.label}
          </span>
          <span className={cn("text-xs", PRIORITY_COLORS[interview.priority])}>●</span>
        </div>
        <p className="text-sm text-muted-foreground">{interview.role_title}</p>
        {interview.next_round?.scheduled_at && (
          <p className="text-xs text-violet-300 mt-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(interview.next_round.scheduled_at).toLocaleDateString("en-GB", {
              weekday: "short", day: "2-digit", month: "short",
              hour: "2-digit", minute: "2-digit",
            })}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onLaunch}
          className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs rounded-lg transition-all"
        >
          Co-pilot
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
