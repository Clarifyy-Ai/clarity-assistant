import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { profilesDB, supportDB } from "@/lib/supabase/database";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  MessageSquare, Send, CheckCircle2, Clock, AlertCircle, Search,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";

interface Thread {
  id: string;
  user_id: string;
  subject: string;
  status: "open" | "pending" | "resolved" | "snoozed";
  priority: "low" | "normal" | "high" | "urgent";
  last_message_at: string;
  last_message_preview: string | null;
  unread_for_admin: boolean;
}

interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_role: "user" | "admin" | "system";
  body: string;
  created_at: string;
}

interface ProfileLite { id: string; full_name: string | null; email: string | null; }

export default function AdminLiveChat() {
  const user = useAuthStore((s) => s.user);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "pending" | "resolved">("open");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load threads
  useEffect(() => { void loadThreads(); }, [statusFilter]);

  async function loadThreads() {
    setLoading(true);
    setLoadError(null);
    try {
      const list = (await supportDB.listThreads(statusFilter)) as Thread[];
      setThreads(list);

      const ids = Array.from(new Set(list.map((t) => t.user_id)));
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load support threads";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  // Load messages for active thread
  useEffect(() => {
    if (!activeId) return;
    (async () => {
      try {
        const data = (await supportDB.listMessagesByThreadId(activeId)) as Message[];
        setMessages(data ?? []);
        await supportDB.markThreadReadForAdmin(activeId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load messages");
      }
    })();
  }, [activeId]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("admin-support")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_threads" }, () => loadThreads())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        const m = payload.new as Message;
        if (m.thread_id === activeId) setMessages((prev) => [...prev, m]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const filtered = useMemo(() => {
    if (!search.trim()) return threads;
    const q = search.toLowerCase();
    return threads.filter((t) => {
      const p = profiles[t.user_id];
      return (
        t.subject?.toLowerCase().includes(q) ||
        t.last_message_preview?.toLowerCase().includes(q) ||
        p?.full_name?.toLowerCase().includes(q) ||
        p?.email?.toLowerCase().includes(q)
      );
    });
  }, [threads, search, profiles]);

  const openCount = threads.filter((t) => t.status === "open").length;
  const pendingCount = threads.filter((t) => t.status === "pending").length;
  const resolvedCount = threads.filter((t) => t.status === "resolved").length;

  async function sendReply() {
    if (!activeId || !reply.trim() || !user?.id) return;
    setSending(true);
    const body = reply.trim();
    setReply("");
    try {
      await supportDB.sendMessage({
        thread_id: activeId,
        sender_id: user.id,
        sender_role: "admin",
        body,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  async function setStatus(id: string, status: Thread["status"]) {
    try {
      await supportDB.updateThread(id, { status });
      toast.success(`Marked ${status}`);
      void loadThreads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update thread");
    }
  }

  const active = threads.find((t) => t.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" /> Live Chat / Support
        </h1>
        <div className="flex gap-2">
          <KPI label="Open" value={openCount} icon={<AlertCircle className="w-3.5 h-3.5" />} color="text-amber-400" />
          <KPI label="Pending" value={pendingCount} icon={<Clock className="w-3.5 h-3.5" />} color="text-blue-400" />
          <KPI label="Resolved" value={resolvedCount} icon={<CheckCircle2 className="w-3.5 h-3.5" />} color="text-emerald-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Threads list */}
        <Card padding="none" className="flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search threads…"
              leftIcon={<Search className="w-3.5 h-3.5" />}
            />
            <div className="flex gap-1">
              {(["all", "open", "pending", "resolved"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "flex-1 px-2 py-1 rounded-lg text-[10px] uppercase font-semibold transition",
                    statusFilter === s
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
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
                const p = profiles[t.user_id];
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted/30 transition",
                      activeId === t.id && "bg-muted/40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {p?.full_name ?? p?.email ?? "Unknown"}
                      </span>
                      {t.unread_for_admin && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{t.subject}</p>
                    <p className="text-[10px] text-muted-foreground/70 line-clamp-1 mt-0.5">{t.last_message_preview ?? "—"}</p>
                    <p className="text-[9px] text-muted-foreground/50 mt-1">
                      {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Conversation pane */}
        <Card padding="none" className="flex flex-col overflow-hidden">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a thread to view the conversation
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-bold">{active.subject}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {profiles[active.user_id]?.email ?? active.user_id}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Badge size="sm" variant={active.status === "resolved" ? "default" : "violet"}>{active.status}</Badge>
                  <Button size="xs" variant="secondary" onClick={() => setStatus(active.id, "pending")}>
                    Pending
                  </Button>
                  <Button size="xs" variant="secondary" onClick={() => setStatus(active.id, "resolved")}>
                    Resolve
                  </Button>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/10">
                {messages.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground italic">No messages yet</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                        m.sender_role === "admin"
                          ? "ml-auto bg-primary/15 text-foreground"
                          : "bg-card border border-border text-foreground"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 border-t border-border flex gap-2">
                <Input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type a reply…"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
                />
                <Button onClick={sendReply} disabled={sending || !reply.trim()} loading={sending} leftIcon={<Send className="w-4 h-4" />}>
                  Send
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
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
