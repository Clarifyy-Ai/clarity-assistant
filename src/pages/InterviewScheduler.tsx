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
  low:      "text-gray-400",
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
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white">Interview Tracker</h1>
            <p className="text-gray-400 mt-1 text-sm">
              Manage your active job applications and interview pipeline
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
              {(["kanban", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setActiveView(v)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-all",
                    activeView === v ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>

            <button
              onClick={() => setAddDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-all"
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
                  className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{i.company_name}</p>
                    <p className="text-xs text-gray-400">
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
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-lg transition-all"
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
                      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        {stage.label}
                      </span>
                      <span className="text-xs text-gray-500 bg-white/10 rounded-full px-2 py-0.5">
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
                      <div className="text-center py-6 text-gray-600 text-xs">
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
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 text-sm">
                <Briefcase className="w-10 h-10 mb-3 text-gray-600" />
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
            <div className="w-full max-w-md bg-[#12121a] border border-white/15 rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-white">Track New Interview</h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1.5">Company *</label>
                  <input
                    value={form.company_name ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                    placeholder="e.g. Stripe"
                    className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1.5">Role Title *</label>
                  <input
                    value={form.role_title ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, role_title: e.target.value }))}
                    placeholder="e.g. Senior Software Engineer"
                    className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Stage</label>
                  <select
                    value={form.stage}
                    onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as InterviewStage }))}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-violet-500 text-sm"
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as any }))}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-violet-500 text-sm"
                  >
                    <option value="critical">🔴 Critical</option>
                    <option value="high">🟠 High</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="low">⚪ Low</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1.5">Job
