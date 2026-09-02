import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { profilesDB, supportDB } from "@/lib/supabase/database";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  MessageSquare, Send, CheckCircle2, Clock, AlertCircle, Search, UserPlus, StickyNote, Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  eventVisibleToUser,
  threadMatchesQueue,
  type SupportQueueFilter,
} from "@/lib/support/adminQueue";

interface Thread {
  id: string;
  user_id: string | null;
  guest_email?: string | null;
  guest_name?: string | null;
  subject: string;
  status: "open" | "pending" | "resolved" | "snoozed";
  mode?: string | null;
  category?: string | null;
  public_ref?: string | null;
  source_path?: string | null;
  context_snapshot?: Record<string, unknown> | null;
  assigned_admin_id?: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  last_message_at: string;
  last_message_preview: string | null;
  unread_for_admin: boolean;
}

interface Message {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_role: "user" | "admin" | "system";
  sender_type?: "user" | "ai" | "agent" | "system";
  body: string;
  created_at: string;
}

interface SupportEvent {
  id: string;
  event_type: string;
  visibility: string;
  body: string | null;
  created_at: string;
  actor_id: string | null;
}

interface Attachment {
  id: string;
  storage_path: string;
  content_type: string;
  byte_size: number;
  scanned_status: string;
}

interface ProfileLite { id: string; full_name: string | null; email: string | null; }

const QUEUE_FILTERS: SupportQueueFilter[] = [
  "all",
  "open",
  "pending",
  "escalated",
  "assigned",
  "resolved",
];

export default function AdminLiveChat() {
  const user = useAuthStore((s) => s.user);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [admins, setAdmins] = useState<ProfileLite[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<SupportEvent[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [statusFilter, setStatusFilter] = useState<SupportQueueFilter>("open");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [realtimeDegraded, setRealtimeDegraded] = useState(false);

  useEffect(() => { void loadThreads(); }, []);

  async function loadThreads() {
    setLoading(true);
    setLoadError(null);
    try {
      const list = (await supportDB.listThreads("all")) as Thread[];
      setThreads(list);
      const ids = Array.from(
        new Set(list.map((t) => t.user_id).filter((id): id is string => Boolean(id))),
      );
      if (ids.length) {
        const profs = await profilesDB.listLiteByIds(ids);
        const map: Record<string, ProfileLite> = {};
        profs.forEach((p) => {
          map[p.id] = { id: p.id, full_name: p.full_name ?? null, email: p.email ?? null };
        });
        setProfiles(map);
      } else {
        setProfiles({});
      }
      try {
        const adminList = await supportDB.listAssignableAdmins();
        setAdmins(adminList.map((p) => ({ id: p.id, full_name: p.full_name ?? null, email: p.email ?? null })));
      } catch {
        setAdmins([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load support threads";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadThreadExtras(id: string) {
    try {
      const [msgs, evs, atts] = await Promise.all([
        supportDB.listMessagesByThreadId(id) as Promise<Message[]>,
        supportDB.listEventsByThreadId(id) as Promise<SupportEvent[]>,
        supportDB.listAttachmentsByThreadId(id) as Promise<Attachment[]>,
      ]);
      setMessages(msgs ?? []);
      setEvents(evs ?? []);
      setAttachments(atts ?? []);
      await supportDB.markThreadReadForAdmin(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load messages");
    }
  }

  useEffect(() => {
    if (!activeId) return;
    void loadThreadExtras(activeId);
  }, [activeId]);

  useEffect(() => {
    setRealtimeDegraded(false);
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setRealtimeDegraded(true);
      }
    }, 8000);

    const ch = supabase
      .channel(`admin-support-${activeId ?? "list"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_threads" }, () => {
        void loadThreads();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        const m = payload.new as Message;
        if (m.thread_id === activeId) setMessages((prev) => [...prev, m]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_events" }, (payload) => {
        const ev = payload.new as SupportEvent & { thread_id?: string };
        if (ev.thread_id === activeId) setEvents((prev) => [...prev, ev]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          settled = true;
          window.clearTimeout(timer);
          setRealtimeDegraded(false);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          settled = true;
          window.clearTimeout(timer);
          setRealtimeDegraded(true);
        }
      });

    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const queued = useMemo(
    () => threads.filter((t) => threadMatchesQueue(t, statusFilter)),
    [threads, statusFilter],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return queued;
    const q = search.toLowerCase();
    return queued.filter((t) => {
      const p = t.user_id ? profiles[t.user_id] : undefined;
      return (
        t.subject?.toLowerCase().includes(q) ||
        t.public_ref?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        t.last_message_preview?.toLowerCase().includes(q) ||
        t.guest_name?.toLowerCase().includes(q) ||
        t.guest_email?.toLowerCase().includes(q) ||
        p?.full_name?.toLowerCase().includes(q) ||
        p?.email?.toLowerCase().includes(q)
      );
    });
  }, [queued, search, profiles]);

  const openCount = threads.filter((t) => threadMatchesQueue(t, "open")).length;
  const pendingCount = threads.filter((t) => threadMatchesQueue(t, "pending")).length;
  const escalatedCount = threads.filter((t) => threadMatchesQueue(t, "escalated")).length;
  const resolvedCount = threads.filter((t) => threadMatchesQueue(t, "resolved")).length;

  async function adminAction(action: string, extra: Record<string, unknown> = {}) {
    if (!activeId) return;
    setSending(true);
    try {
      await fetchEdgeJson("support-chat", {
        action,
        thread_id: activeId,
        ...extra,
      });
      const { writeAdminAudit } = await import("@/lib/admin/writeAdminAudit");
      await writeAdminAudit({
        action: `support.${action}`,
        targetType: "support_thread",
        targetId: activeId,
        newValue: extra,
      });
      await loadThreadExtras(activeId);
      await loadThreads();
    } catch (err) {
      const { adminActionFailedMessage } = await import("@/lib/admin/adminErrors");
      toast.error(adminActionFailedMessage(err, `AdminLiveChat.${action}`));
    } finally {
      setSending(false);
    }
  }

  async function sendReply() {
    if (!activeId || !reply.trim() || sending) return;
    const body = reply.trim();
    setReply("");
    await adminAction("admin_reply", { message: body });
  }

  async function sendNote() {
    if (!activeId || !note.trim() || sending) return;
    const body = note.trim();
    setNote("");
    await adminAction("admin_note", { message: body });
    toast.success("Internal note saved");
  }

  async function downloadAttachment(att: Attachment) {
    try {
      const url = await supportDB.createAttachmentSignedUrl(att.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download attachment");
    }
  }

  const active = threads.find((t) => t.id === activeId) ?? null;
  const snapshot = (active?.context_snapshot ?? {}) as Record<string, unknown>;
  const internalNotes = events.filter((e) => !eventVisibleToUser(e.visibility));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" /> Live Support
        </h1>
        <div className="flex gap-2 items-center flex-wrap">
          {realtimeDegraded && (
            <p className="text-xs text-amber-600 max-w-[220px]">
              Realtime unavailable — use Refresh for updates.
            </p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void loadThreads()}>
            Refresh
          </Button>
          <KPI label="Open" value={openCount} icon={<AlertCircle className="w-3.5 h-3.5" />} color="text-amber-400" />
          <KPI label="Pending" value={pendingCount} icon={<Clock className="w-3.5 h-3.5" />} color="text-blue-400" />
          <KPI label="Escalated" value={escalatedCount} icon={<AlertCircle className="w-3.5 h-3.5" />} color="text-rose-400" />
          <KPI label="Resolved" value={resolvedCount} icon={<CheckCircle2 className="w-3.5 h-3.5" />} color="text-emerald-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr_260px] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        <Card padding="none" className="flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search threads…"
              leftIcon={<Search className="w-3.5 h-3.5" />}
            />
            <div className="flex flex-wrap gap-1">
              {QUEUE_FILTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[10px] uppercase font-semibold transition",
                    statusFilter === s
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadError ? (
              <div className="p-4">
                <InlineErrorRetry message={loadError} onRetry={() => void loadThreads()} />
              </div>
            ) : loading ? (
              <div className="space-y-2 p-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No threads"
                description={
                  search.trim()
                    ? "No threads match your search."
                    : `No ${statusFilter === "all" ? "" : statusFilter} support threads right now.`
                }
                compact
              />
            ) : (
              filtered.map((t) => {
                const p = t.user_id ? profiles[t.user_id] : undefined;
                const label =
                  p?.full_name ??
                  p?.email ??
                  t.guest_name ??
                  t.guest_email ??
                  "Guest";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted/30 transition",
                      activeId === t.id && "bg-muted/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {label}
                        {!t.user_id && (
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                            (guest)
                          </span>
                        )}
                      </span>
                      {t.unread_for_admin && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t.public_ref ?? t.id.slice(0, 8)} · {t.category ?? "general"}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 line-clamp-1 mt-0.5">{t.last_message_preview ?? "—"}</p>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {t.mode === "waiting_agent" ? "Escalated · " : ""}
                      {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card padding="none" className="flex flex-col overflow-hidden">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a thread to view the conversation
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-bold">{active.public_ref ?? active.subject}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {active.user_id
                      ? (profiles[active.user_id]?.email ?? active.user_id)
                      : (active.guest_email ?? active.guest_name ?? "Guest visitor")}
                    {" · "}
                    {active.category ?? "general"}
                    {active.source_path ? ` · ${active.source_path}` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <Badge size="sm" variant={active.status === "resolved" ? "default" : "violet"}>
                    {active.mode === "waiting_agent" ? "escalated" : active.status}
                  </Badge>
                  <Button size="xs" variant="secondary" disabled={sending} onClick={() => void adminAction("admin_resolve")}>
                    Resolve
                  </Button>
                  <Button size="xs" variant="secondary" disabled={sending} onClick={() => void adminAction("admin_reopen")}>
                    Reopen
                  </Button>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/10">
                {messages.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground italic">No messages yet</p>
                ) : (
                  messages.map((m) => {
                    const type = m.sender_type ?? (m.sender_role === "admin" ? "agent" : m.sender_role);
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                          type === "agent"
                            ? "ml-auto bg-primary/15 text-foreground"
                            : type === "ai"
                              ? "bg-sky-500/10 border border-sky-500/20 text-foreground"
                              : "bg-card border border-border text-foreground",
                        )}
                      >
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-0.5">
                          {type === "ai" ? "Career Pilot" : type === "agent" ? "Agent" : type === "system" ? "System" : "User"}
                        </p>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className="text-[9px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 border-t border-border space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Reply as agent…"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
                  />
                  <Button onClick={() => void sendReply()} disabled={sending || !reply.trim()} loading={sending} leftIcon={<Send className="w-4 h-4" />}>
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        <Card padding="none" className="flex flex-col overflow-hidden">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
              Context, notes, and attachments appear here
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
              <section>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Context snapshot</p>
                <dl className="space-y-1 text-[11px]">
                  <Row label="Ref" value={active.public_ref ?? "—"} />
                  <Row label="Category" value={active.category ?? "general"} />
                  <Row label="Page" value={active.source_path ?? "—"} />
                  <Row label="Credits" value={snapshot.credits != null ? String(snapshot.credits) : "—"} />
                  <Row label="Plan" value={typeof snapshot.plan_id === "string" ? snapshot.plan_id : "—"} />
                  <Row
                    label="Job"
                    value={
                      snapshot.job && typeof snapshot.job === "object"
                        ? `${(snapshot.job as { id?: string }).id?.slice(0, 8) ?? "—"} · ${(snapshot.job as { status?: string }).status ?? ""}`
                        : "—"
                    }
                  />
                  <Row
                    label="Payment"
                    value={
                      snapshot.payment && typeof snapshot.payment === "object"
                        ? `${(snapshot.payment as { id?: string }).id?.slice(0, 8) ?? "—"} · ${(snapshot.payment as { status?: string }).status ?? ""}`
                        : "—"
                    }
                  />
                </dl>
              </section>

              <section>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Assignment</p>
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={sending || !user?.id}
                    leftIcon={<UserPlus className="w-3 h-3" />}
                    onClick={() => void adminAction("admin_assign", { admin_id: user?.id })}
                  >
                    Assign to me
                  </Button>
                  {admins.length > 0 && (
                    <div className="flex gap-1">
                      <select
                        value={assignTo}
                        onChange={(e) => setAssignTo(e.target.value)}
                        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px]"
                      >
                        <option value="">Another admin…</option>
                        {admins.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.full_name || a.email || a.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="xs"
                        disabled={!assignTo || sending}
                        onClick={() => void adminAction("admin_assign", { admin_id: assignTo })}
                      >
                        Assign
                      </Button>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 inline-flex items-center gap-1">
                  <Paperclip className="w-3 h-3" /> Attachments
                </p>
                {attachments.length === 0 ? (
                  <p className="text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-1">
                    {attachments.map((att) => (
                      <li key={att.id}>
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline truncate max-w-full"
                          onClick={() => void downloadAttachment(att)}
                        >
                          {att.storage_path.split("/").pop()} ({Math.round(att.byte_size / 1024)} KB)
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 inline-flex items-center gap-1">
                  <StickyNote className="w-3 h-3" /> Internal notes
                </p>
                <p className="text-[10px] text-muted-foreground mb-2">Not shown to the user.</p>
                <div className="space-y-1.5 mb-2">
                  {internalNotes.length === 0 ? (
                    <p className="text-muted-foreground">No notes yet</p>
                  ) : (
                    internalNotes.map((n) => (
                      <div key={n.id} className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                        <p className="whitespace-pre-wrap">{n.body}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {n.event_type} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-1">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add internal note…"
                    className="h-8 text-[11px]"
                  />
                  <Button size="xs" disabled={sending || !note.trim()} onClick={() => void sendNote()}>
                    Save
                  </Button>
                </div>
              </section>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground truncate">{value}</dd>
    </div>
  );
}

function KPI({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="px-3 py-1.5 rounded-xl border border-border bg-card flex items-center gap-2">
      <span className={color}>{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground">{value}</span>
    </div>
  );
}
