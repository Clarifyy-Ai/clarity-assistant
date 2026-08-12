import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { MessageCircle, X, Send, LifeBuoy } from "lucide-react";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useAuthStore } from "@/store/userStore";
import { SUPPORT_EMAIL } from "@/lib/constants/contact";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const GUEST_TOKEN_KEY = "clarify-support-guest-token";
const THREAD_KEY = "clarify-support-thread-id";

type ChatMessage = {
  id: string;
  thread_id: string;
  sender_role: "user" | "admin" | "system";
  body: string;
  created_at: string;
};

type ChatResponse = {
  thread_id: string;
  guest_token?: string | null;
  status?: string;
  messages: ChatMessage[];
};

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function shouldHideWidget(pathname: string): boolean {
  return (
    pathname.startsWith("/app/admin/live-chat") ||
    pathname.startsWith("/app/live") ||
    pathname.startsWith("/app/interview")
  );
}

/**
 * Floating Live Chat widget for marketing, auth, and app shells.
 * Guests chat via support-chat edge; messages land in Admin → Live Chat.
 */
function clearChatSession(): void {
  writeStorage(THREAD_KEY, null);
  writeStorage(GUEST_TOKEN_KEY, null);
}

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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hide = shouldHideWidget(location.pathname);
  const offsetMobileNav = location.pathname.startsWith("/app");
  const showGuestFields = (!isAuthed || forceGuestFields) && !threadId;

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

  function resetThreadLocally(message?: string) {
    clearChatSession();
    setThreadId(null);
    setGuestToken(null);
    setMessages([]);
    setForceGuestFields(true);
    if (message) setError(message);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Prefill guest contact from the signed-in profile when available.
  useEffect(() => {
    if (!isAuthed) return;
    if (!guestName && (profile?.full_name || user?.email)) {
      setGuestName(profile?.full_name?.trim() || user?.email?.split("@")[0] || "");
    }
    if (!guestEmail && (user?.email || profile?.email)) {
      setGuestEmail(user?.email?.trim() || profile?.email?.trim() || "");
    }
  }, [isAuthed, profile?.full_name, profile?.email, user?.email, guestName, guestEmail]);

  // Restore / poll conversation while panel is open.
  useEffect(() => {
    if (!open || hide) return;
    if (!threadId) return;
    if (!isAuthed && !guestToken) return;

    let cancelled = false;

    async function pull() {
      try {
        const data = await fetchEdgeJson<ChatResponse>("support-chat", {
          action: "list",
          thread_id: threadId,
          guest_token: guestToken,
        });
        if (!cancelled) {
          setMessages(data.messages ?? []);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not load chat";
        const status = typeof (err as { status?: number })?.status === "number"
          ? (err as { status: number }).status
          : undefined;
        // Stale thread / lost guest token after logout — start fresh instead of looping errors.
        if (status === 403 || status === 404 || /forbidden|not found/i.test(message)) {
          resetThreadLocally("Previous chat session expired. Enter your details to continue.");
          return;
        }
        setError(message);
      }
    }

    void pull();
    const t = window.setInterval(() => void pull(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [open, hide, threadId, guestToken, isAuthed]);

  if (hide) return null;

  async function submitMessage(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    // Always send contact fields as a fallback: UI may be "authenticated" while the
    // Edge call only has the anon key (tab-local logout / expired JWT).
    if (!resolvedGuestName || !resolvedGuestEmail) {
      setForceGuestFields(true);
      setError("Please enter your name and email to start chatting.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const action = threadId ? "send" : "start";
      const data = await fetchEdgeJson<ChatResponse>("support-chat", {
        action,
        message: text,
        thread_id: threadId,
        guest_token: guestToken,
        guest_name: resolvedGuestName,
        guest_email: resolvedGuestEmail,
      });

      setThreadId(data.thread_id);
      writeStorage(THREAD_KEY, data.thread_id);
      if (data.guest_token) {
        setGuestToken(data.guest_token);
        writeStorage(GUEST_TOKEN_KEY, data.guest_token);
      }
      setForceGuestFields(false);
      setMessages(data.messages ?? []);
      setDraft("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      const status = typeof (err as { status?: number })?.status === "number"
        ? (err as { status: number }).status
        : undefined;
      if (status === 403 || status === 404 || /forbidden|not found/i.test(message)) {
        resetThreadLocally("Previous chat session expired. Enter your details and send again.");
      } else if (/name and email/i.test(message)) {
        setForceGuestFields(true);
        setError("Please enter your name and email to start chatting.");
      } else {
        setError(message);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed right-4 z-[80] flex flex-col items-end gap-3 pointer-events-none",
        offsetMobileNav ? "bottom-20 md:bottom-4" : "bottom-4",
      )}
    >
      {open && (
        <div
          className="pointer-events-auto w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          role="dialog"
          aria-label="Live chat support"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div className="min-w-0">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <LifeBuoy className="h-4 w-4 shrink-0" aria-hidden />
                Live Chat / Support
              </p>
              <p className="text-[11px] text-primary-foreground/80 truncate">
                We typically reply within a few hours
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 hover:bg-primary-foreground/10 transition-colors"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex h-72 flex-col bg-background">
            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ask about pricing, exams, billing, or product help. Or email{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </p>
              )}
              {messages.map((m) => {
                const mine = m.sender_role === "user";
                return (
                  <div
                    key={m.id}
                    className={cn("flex", mine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                        mine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-secondary text-foreground rounded-bl-md",
                      )}
                    >
                      {m.body}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

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

            <form
              onSubmit={(e) => void submitMessage(e)}
              className="flex items-end gap-2 border-t border-border p-3"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={4000}
                placeholder="Type your message…"
                className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="submit"
                size="sm"
                disabled={sending || !draft.trim()}
                className="shrink-0"
                aria-label="Send message"
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
        aria-label={open ? "Close live chat" : "Open live chat support"}
        aria-expanded={open}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </Button>
    </div>
  );
}
