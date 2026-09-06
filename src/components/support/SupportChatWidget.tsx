import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { MessageCircle, X, Send, LifeBuoy, Paperclip, RotateCcw } from "lucide-react";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { SUPPORT_EMAIL } from "@/lib/constants/contact";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  SUPPORT_CHIPS,
  SUPPORT_COMPOSER_PLACEHOLDER,
  SUPPORT_AI_TIMEOUT_MS,
  SUPPORT_CONNECT_TIMEOUT_MS,
  SUPPORT_FAILED_LABEL,
  SUPPORT_GUEST_POLL_MS,
  SUPPORT_MAX_BODY,
  SUPPORT_SENDING_LABEL,
  SUPPORT_WIDGET_ARIA,
  SUPPORT_WIDGET_GREETING,
  SUPPORT_WIDGET_SLA,
  SUPPORT_WIDGET_TITLE,
  canSubmitSupportMessage,
  supportChatUserFacingError,
  validateSupportAttachment,
  type SupportChipId,
} from "@/lib/support/supportCopy";
import {
  waitingStatusLabel,
  type SupportPriority,
} from "@/lib/support/triage";

const GUEST_TOKEN_KEY = "career-pilot-support-guest-token";
const THREAD_KEY = "career-pilot-support-thread-id";
const LEGACY_GUEST_TOKEN_KEY = "clarify-support-guest-token";
const LEGACY_THREAD_KEY = "clarify-support-thread-id";

function readSupportStorage(primary: string, legacy: string): string | null {
  try {
    const value = localStorage.getItem(primary) ?? localStorage.getItem(legacy);
    if (value && !localStorage.getItem(primary)) {
      localStorage.setItem(primary, value);
      localStorage.removeItem(legacy);
    }
    return value;
  } catch {
    return null;
  }
}

function writeSupportStorage(primary: string, legacy: string, value: string): void {
  try {
    localStorage.setItem(primary, value);
    localStorage.removeItem(legacy);
  } catch {
    /* ignore */
  }
}

type SenderType = "user" | "ai" | "agent" | "system";

type ChatMessage = {
  id: string;
  thread_id: string;
  sender_role: "user" | "admin" | "system";
  sender_type?: SenderType;
  body: string;
  created_at: string;
  delivery_status?: string;
  client_message_id?: string | null;
};

type ThreadSummary = {
  id: string;
  public_ref: string | null;
  subject: string;
  status: string;
  mode: string;
  category: string;
  last_message_at: string;
  last_message_preview: string | null;
};

type ChatResponse = {
  thread_id: string | null;
  guest_token?: string | null;
  status?: string | null;
  mode?: string | null;
  category?: string | null;
  priority?: SupportPriority | null;
  public_ref?: string | null;
  messages: ChatMessage[];
  threads?: ThreadSummary[];
  attachment_id?: string;
  token?: string;
  path?: string;
  signed_url?: string;
};

type UiState =
  | "offline"
  | "connecting"
  | "connected"
  | "ai_typing"
  | "waiting_for_agent"
  | "agent_connected"
  | "resolved"
  | "failed";

function readStorage(key: string): string | null {
  const legacy =
    key === THREAD_KEY
      ? LEGACY_THREAD_KEY
      : key === GUEST_TOKEN_KEY
        ? LEGACY_GUEST_TOKEN_KEY
        : null;
  if (legacy) return readSupportStorage(key, legacy);
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  const legacy =
    key === THREAD_KEY
      ? LEGACY_THREAD_KEY
      : key === GUEST_TOKEN_KEY
        ? LEGACY_GUEST_TOKEN_KEY
        : null;
  try {
    if (value == null) {
      localStorage.removeItem(key);
      if (legacy) localStorage.removeItem(legacy);
      return;
    }
    if (legacy) {
      writeSupportStorage(key, legacy, value);
      return;
    }
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function shouldHideWidget(pathname: string): boolean {
  return (
    pathname.startsWith("/app/admin/live-chat") ||
    pathname.startsWith("/app/live") ||
    pathname.startsWith("/app/interview") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding")
  );
}

function clearChatSession(): void {
  writeStorage(THREAD_KEY, null);
  writeStorage(GUEST_TOKEN_KEY, null);
}

function senderTypeOf(m: ChatMessage): SenderType {
  if (m.sender_type) return m.sender_type;
  if (m.sender_role === "admin") return "agent";
  if (m.sender_role === "system") return "system";
  return "user";
}

function modeToUi(mode: string | null | undefined, fallback: UiState): UiState {
  if (mode === "waiting_agent") return "waiting_for_agent";
  if (mode === "agent") return "agent_connected";
  if (mode === "resolved") return "resolved";
  if (mode === "ai") return "connected";
  return fallback;
}

function statusLabel(state: UiState, priority?: SupportPriority | null): string {
  switch (state) {
    case "connecting":
      return "Connecting…";
    case "ai_typing":
      return "Career Pilot is writing…";
    case "waiting_for_agent":
      return waitingStatusLabel(priority);
    case "agent_connected":
      return "Agent connected";
    case "resolved":
      return "Resolved";
    case "failed":
      return "Could not connect";
    case "offline":
      return "Offline";
    default:
      return SUPPORT_WIDGET_SLA;
  }
}

/**
 * Career Pilot hybrid Live Chat: chips first, Edge-owned identity,
 * Realtime for signed-in users, short poll for guests.
 */
export function SupportChatWidget() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const authStatus = useAuthStore((s) => s.status);
  const isAuthed = authStatus === "authenticated" && Boolean(user?.id);

  const [open, setOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [forceGuestFields, setForceGuestFields] = useState(false);
  const [draft, setDraft] = useState("");
  const [threadId, setThreadId] = useState<string | null>(() => readStorage(THREAD_KEY));
  const [guestToken, setGuestToken] = useState<string | null>(() => readStorage(GUEST_TOKEN_KEY));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [uiState, setUiState] = useState<UiState>("connected");
  const [sending, setSending] = useState(false);
  const [failedClientId, setFailedClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ThreadSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [publicRef, setPublicRef] = useState<string | null>(null);
  const [threadPriority, setThreadPriority] = useState<SupportPriority | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastClientIdRef = useRef<string | null>(null);
  const lastPayloadRef = useRef<{
    text: string;
    category?: string;
    escalate?: boolean;
  } | null>(null);

  const hide = shouldHideWidget(location.pathname);
  const offsetMobileNav = location.pathname.startsWith("/app");
  const onAuthShell = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/auth/",
  ].some((p) => location.pathname.startsWith(p));
  const showGuestFields = (!isAuthed || forceGuestFields) && !threadId;
  const showChips = messages.length === 0 && !sending && uiState !== "connecting";

  const resolvedGuestName =
    guestName.trim() ||
    profile?.full_name?.trim() ||
    user?.email?.split("@")[0]?.trim() ||
    "";
  const resolvedGuestEmail =
    guestEmail.trim() ||
    user?.email?.trim() ||
    profile?.email?.trim() ||
    "";

  function persistThread(id: string, token?: string | null) {
    setThreadId(id);
    writeStorage(THREAD_KEY, id);
    if (token) {
      setGuestToken(token);
      writeStorage(GUEST_TOKEN_KEY, token);
    }
  }

  function resetThreadLocally(message?: string) {
    clearChatSession();
    setThreadId(null);
    setGuestToken(null);
    setMessages([]);
    setPublicRef(null);
    setThreadPriority(null);
    setForceGuestFields(true);
    setUiState("connected");
    if (message) setError(message);
  }

  function applyResponse(data: ChatResponse) {
    if (data.thread_id) persistThread(data.thread_id, data.guest_token);
    setMessages(data.messages ?? []);
    setPublicRef(data.public_ref ?? null);
    setThreadPriority(data.priority ?? null);
    setUiState(modeToUi(data.mode, "connected"));
    setError(null);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, open, uiState]);

  useEffect(() => {
    if (!isAuthed) return;
    if (!guestName && (profile?.full_name || user?.email)) {
      setGuestName(profile?.full_name?.trim() || user?.email?.split("@")[0] || "");
    }
    if (!guestEmail && (user?.email || profile?.email)) {
      setGuestEmail(user?.email?.trim() || profile?.email?.trim() || "");
    }
  }, [isAuthed, profile?.full_name, profile?.email, user?.email, guestName, guestEmail]);

  const bootstrap = useCallback(async () => {
    if (!open || hide) return;
    setUiState("connecting");
    const timer = window.setTimeout(() => {
      setUiState((prev) => (prev === "connecting" ? "failed" : prev));
    }, SUPPORT_CONNECT_TIMEOUT_MS);
    try {
      const data = await fetchEdgeJson<ChatResponse>("support-chat", {
        action: "bootstrap",
        thread_id: threadId,
        guest_token: guestToken,
      }, { timeoutMs: SUPPORT_CONNECT_TIMEOUT_MS });
      window.clearTimeout(timer);
      if (!data.thread_id) {
        setMessages([]);
        setUiState("connected");
        setError(null);
        return;
      }
      applyResponse(data);
    } catch (err) {
      window.clearTimeout(timer);
      const status = typeof (err as { status?: number })?.status === "number"
        ? (err as { status: number }).status
        : undefined;
      if (status === 403 || status === 404) {
        resetThreadLocally("Previous chat session expired. Enter your details to continue.");
        return;
      }
      setUiState("failed");
      setError(supportChatUserFacingError(err));
    }
  }, [open, hide, threadId, guestToken]);

  useEffect(() => {
    if (!open || hide) return;
    void bootstrap();
    // bootstrap on open only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hide]);

  useEffect(() => {
    if (!open || hide || !isAuthed) return;
    void fetchEdgeJson<ChatResponse>("support-chat", { action: "list_threads" })
      .then((data) => setHistory(data.threads ?? []))
      .catch(() => setHistory([]));
  }, [open, hide, isAuthed, threadId]);

  useEffect(() => {
    if (!open || hide || !threadId) return;
    if (isAuthed) {
      const ch = supabase
        .channel(`support-user-${threadId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${threadId}` },
          (payload) => {
            const m = payload.new as ChatMessage;
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
            if (senderTypeOf(m) !== "user") setUiState((s) => (s === "ai_typing" ? "connected" : s));
          },
        )
        .subscribe();
      return () => {
        void supabase.removeChannel(ch);
      };
    }
    // Self-scheduling poll with exponential backoff. A fixed interval hits the
    // support-chat guest rate limit (8 req/min) and floods the console with 429s.
    let cancelled = false;
    let timer = 0;
    let delay = SUPPORT_GUEST_POLL_MS;

    const tick = async () => {
      try {
        const data = await fetchEdgeJson<ChatResponse>("support-chat", {
          action: "list",
          thread_id: threadId,
          guest_token: guestToken,
        });
        if (cancelled) return;
        applyResponse(data);
        delay = SUPPORT_GUEST_POLL_MS;
      } catch (err) {
        const status = (err as { status?: number })?.status;
        // 429 (or any failure) → back off up to 60s instead of retrying hot.
        delay = Math.min(delay * (status === 429 ? 3 : 2), 60_000);
      }
      if (!cancelled) timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, hide, threadId, guestToken, isAuthed]);


  if (hide) return null;

  async function sendPayload(opts: {
    text: string;
    category?: string;
    escalate?: boolean;
    clientId?: string;
  }) {
    if (!resolvedGuestName || !resolvedGuestEmail) {
      setForceGuestFields(true);
      setError("Please enter your name and email to start chatting.");
      return;
    }
    const clientId = opts.clientId ?? crypto.randomUUID();
    lastClientIdRef.current = clientId;
    lastPayloadRef.current = { text: opts.text, category: opts.category, escalate: opts.escalate };
    setSending(true);
    setFailedClientId(null);
    setError(null);
    setUiState(opts.escalate ? "waiting_for_agent" : "ai_typing");
    const typingTimer = window.setTimeout(() => {
      setUiState((prev) => (prev === "ai_typing" ? "connected" : prev));
    }, SUPPORT_AI_TIMEOUT_MS);
    const params = new URLSearchParams(location.search);
    const resource_hint = {
      exam_id: params.get("exam_id") || undefined,
      job_id: params.get("job_id") || undefined,
    };
    try {
      const data = await fetchEdgeJson<ChatResponse>("support-chat", {
        action: threadId ? "send" : "start",
        message: opts.text,
        thread_id: threadId,
        guest_token: guestToken,
        guest_name: resolvedGuestName,
        guest_email: resolvedGuestEmail,
        client_message_id: clientId,
        category: opts.category,
        page_path: location.pathname,
        resource_hint:
          resource_hint.exam_id || resource_hint.job_id ? resource_hint : undefined,
        escalate: opts.escalate === true,
      });
      applyResponse(data);
      setDraft("");
      setForceGuestFields(false);
    } catch (err) {
      const message = supportChatUserFacingError(err);
      const status = typeof (err as { status?: number })?.status === "number"
        ? (err as { status: number }).status
        : undefined;
      if (status === 403 || status === 404) {
        resetThreadLocally("Previous chat session expired. Enter your details and send again.");
      } else if (/name and email/i.test(message)) {
        setForceGuestFields(true);
        setError("Please enter your name and email to start chatting.");
      } else {
        setError(message);
      }
      setFailedClientId(clientId);
      setUiState("failed");
    } finally {
      window.clearTimeout(typingTimer);
      setSending(false);
    }
  }

  async function submitMessage(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!canSubmitSupportMessage({ sending, draft })) return;
    await sendPayload({ text });
  }

  async function retryLast() {
    const last = lastPayloadRef.current;
    const id = lastClientIdRef.current;
    if (!last || !id) return;
    await sendPayload({ ...last, clientId: id });
  }

  async function onChip(id: SupportChipId) {
    const chip = SUPPORT_CHIPS.find((c) => c.id === id);
    if (!chip) return;
    if (chip.escalate) {
      if (threadId) {
        setUiState("waiting_for_agent");
        try {
          const data = await fetchEdgeJson<ChatResponse>("support-chat", {
            action: "escalate",
            thread_id: threadId,
            guest_token: guestToken,
          });
          applyResponse(data);
        } catch (err) {
          setError(supportChatUserFacingError(err));
        }
        return;
      }
      await sendPayload({ text: chip.prompt ?? "Talk to Support", category: chip.category, escalate: true });
      return;
    }
    await sendPayload({ text: chip.prompt ?? chip.label, category: chip.category });
  }

  async function onAttach(file: File) {
    if (!threadId) {
      setError("Send a message first, then attach a file.");
      return;
    }
    const invalid = validateSupportAttachment(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      const signed = await fetchEdgeJson<ChatResponse>("support-chat", {
        action: "attachment_url",
        thread_id: threadId,
        guest_token: guestToken,
        content_type: file.type,
        byte_size: file.size,
        filename: file.name,
      });
      if (!signed.signed_url && (!signed.token || !signed.path)) {
        throw new Error("Upload URL missing");
      }
      if (signed.signed_url) {
        const put = await fetch(signed.signed_url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("Could not upload the file");
      } else {
        const { error: upErr } = await supabase.storage
          .from("support-attachments")
          .uploadToSignedUrl(signed.path!, signed.token!, file);
        if (upErr) throw upErr;
      }
      const data = await fetchEdgeJson<ChatResponse>("support-chat", {
        action: "attachment_confirm",
        thread_id: threadId,
        guest_token: guestToken,
        attachment_id: signed.attachment_id,
      });
      applyResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach file");
    }
  }

  async function openHistoryThread(id: string) {
    persistThread(id);
    setShowHistory(false);
    try {
      const data = await fetchEdgeJson<ChatResponse>("support-chat", {
        action: "bootstrap",
        thread_id: id,
      });
      applyResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open conversation");
    }
  }

  return (
    <div
      className={cn(
        "fixed z-[80] flex flex-col items-end gap-3 pointer-events-none",
        onAuthShell ? "left-4 right-auto bottom-28 sm:bottom-8" : "right-4",
        !onAuthShell && (offsetMobileNav ? "bottom-20 md:bottom-4" : "bottom-20 md:bottom-6"),
      )}
    >
      {open && (
        <div
          className="pointer-events-auto w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          role="dialog"
          aria-label={SUPPORT_WIDGET_ARIA}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div className="min-w-0">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <LifeBuoy className="h-4 w-4 shrink-0" aria-hidden />
                {SUPPORT_WIDGET_TITLE}
              </p>
              <p className="text-[11px] text-primary-foreground/80 truncate">
                {uiState === "connecting" || uiState === "ai_typing"
                  ? statusLabel(uiState, threadPriority)
                  : publicRef
                    ? `${publicRef} · ${statusLabel(uiState, threadPriority)}`
                    : statusLabel(uiState, threadPriority)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {isAuthed && (
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="rounded-lg px-2 py-1 text-[10px] hover:bg-primary-foreground/10"
                >
                  Previous
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 hover:bg-primary-foreground/10 transition-colors"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex h-80 flex-col bg-background">
            {showHistory ? (
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No previous conversations.</p>
                ) : (
                  history.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void openHistoryThread(t.id)}
                      className="w-full rounded-lg border border-border px-2 py-2 text-left hover:bg-muted/40"
                    >
                      <p className="text-[11px] font-semibold">
                        {t.public_ref ?? t.id.slice(0, 8)} · {t.category}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {t.last_message_preview ?? t.subject} · {t.status}
                      </p>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {showChips && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {SUPPORT_WIDGET_GREETING} Email{" "}
                      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline-offset-2 hover:underline">
                        {SUPPORT_EMAIL}
                      </a>{" "}
                      anytime.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUPPORT_CHIPS.map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => void onChip(chip.id)}
                          className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[10px] font-medium hover:bg-secondary/80"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m) => {
                  const type = senderTypeOf(m);
                  const mine = type === "user";
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                          mine
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : type === "agent"
                              ? "bg-emerald-500/15 text-foreground rounded-bl-md"
                              : "bg-secondary text-foreground rounded-bl-md",
                        )}
                      >
                        {!mine && (
                          <p className="mb-0.5 text-[9px] uppercase tracking-wide opacity-70">
                            {type === "ai" ? "Career Pilot" : type === "agent" ? "Agent" : "System"}
                          </p>
                        )}
                        {m.body}
                      </div>
                    </div>
                  );
                })}
                {uiState === "ai_typing" && (
                  <p className="text-[11px] text-muted-foreground">Career Pilot is writing…</p>
                )}
                <div ref={bottomRef} />
              </div>
            )}

            {showGuestFields && (
              <div className="grid grid-cols-1 gap-2 border-t border-border px-3 pt-2">
                <Input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="h-9 text-xs"
                />
                <Input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  className="h-9 text-xs"
                />
                {!isAuthed && (
                  <p className="text-[10px] text-muted-foreground">
                    Already have an account?{" "}
                    <Link to="/login" className="text-primary hover:underline">
                      Log in
                    </Link>{" "}
                    for a linked chat history.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="px-3 pt-2 text-[11px] text-destructive" role="alert">
                {error}
              </p>
            )}
            {uiState === "failed" && !failedClientId && (
              <button
                type="button"
                onClick={() => void bootstrap()}
                className="px-3 pt-1 text-[11px] text-primary underline-offset-2 hover:underline text-left inline-flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                Retry connection
              </button>
            )}
            {failedClientId && (
              <button
                type="button"
                onClick={() => void retryLast()}
                className="px-3 pt-1 text-[11px] text-primary underline-offset-2 hover:underline text-left inline-flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                {SUPPORT_FAILED_LABEL}
              </button>
            )}

            {uiState === "waiting_for_agent" && (
              <p className="px-3 pt-2 text-[11px] text-muted-foreground leading-relaxed">
                {publicRef
                  ? `Ticket ${publicRef} is open. `
                  : ""}
                An agent will reply here — your messages stay saved. You can add more details below.
              </p>
            )}

            <form
              onSubmit={(e) => void submitMessage(e)}
              className="flex items-end gap-2 border-t border-border p-3"
            >
              <label className="shrink-0 cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-muted">
                <Paperclip className="h-4 w-4" />
                <input
                  type="file"
                  className="sr-only"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void onAttach(file);
                  }}
                />
              </label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitMessage();
                  }
                }}
                rows={2}
                maxLength={SUPPORT_MAX_BODY}
                placeholder={SUPPORT_COMPOSER_PLACEHOLDER}
                className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!canSubmitSupportMessage({ sending, draft })}
                className="shrink-0"
                aria-label={sending ? SUPPORT_SENDING_LABEL : "Send message"}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto h-12 w-12 rounded-full p-0 shadow-lg"
        aria-label={open ? "Close support" : SUPPORT_WIDGET_ARIA}
        aria-expanded={open}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </Button>
    </div>
  );
}
