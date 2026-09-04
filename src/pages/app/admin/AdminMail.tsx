import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, RefreshCw, Reply, Send } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { ApiClientError } from "@/lib/api/apiClient";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { HOSTINGER_TRACKING_FOLDERS, isTrackingFolder, trackingFolderLabel } from "@/lib/mail/hostingerTrackingFolders";
import { cn } from "@/lib/utils";

type MailStatus = {
  configured: boolean;
  address: string;
  quotaPercent: number | null;
  lastError: string | null;
  fetchedAt: string | null;
};

type MailFolder = {
  path: string;
  name: string;
  unreadCount?: number;
  messageCount?: number;
};

type MailAddress = { name?: string | null; address?: string | null };

type MailMessage = {
  uid: number;
  subject?: string | null;
  date?: string | null;
  unseen?: boolean;
  from?: MailAddress | null;
};

type MailBody = {
  text?: string;
  html?: string;
};

function isNotConfigured(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === "PROVIDER_UNAVAILABLE";
}

function formatFrom(from: MailAddress | null | undefined): string {
  if (!from) return "(unknown)";
  if (from.name && from.address) return `${from.name} <${from.address}>`;
  return from.address || from.name || "(unknown)";
}

function sanitizeMailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/\son\w+=/gi, " data-removed=")
    .replace(/javascript:/gi, "");
}

export default function AdminMail() {
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [folder, setFolder] = useState("INBOX");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [body, setBody] = useState<MailBody | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [readLoading, setReadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [ensuringFolders, setEnsuringFolders] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [replyUid, setReplyUid] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setError(null);
    try {
      const data = await fetchEdgeJson<MailStatus>("hostinger-mail", { action: "status" });
      setStatus(data);
      setNotConfigured(data.configured !== true);
    } catch (err) {
      if (isNotConfigured(err)) {
        setNotConfigured(true);
        setStatus({
          configured: false,
          address: "hello@trycareerpilot.com",
          quotaPercent: null,
          lastError: "Hostinger Mail is not configured.",
          fetchedAt: new Date().toISOString(),
        });
      } else {
        setError(toAdminUserMessage(err, undefined, "AdminMail.status"));
      }
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadFolders = useCallback(async (ensure = false) => {
    try {
      const data = await fetchEdgeJson<{ folders?: MailFolder[]; created?: string[] }>("hostinger-mail", {
        action: ensure ? "ensure-folders" : "folders",
        ensure,
      });
      setFolders(Array.isArray(data.folders) ? data.folders : []);
      if (ensure && Array.isArray(data.created) && data.created.length > 0) {
        toast.success(`Created folders: ${data.created.join(", ")}`);
      }
    } catch (err) {
      if (isNotConfigured(err)) {
        setNotConfigured(true);
        return;
      }
      toast.error(toAdminUserMessage(err, undefined, "AdminMail.folders"));
    }
  }, []);

  const loadMessages = useCallback(async (nextFolder: string) => {
    setListLoading(true);
    setSelectedUid(null);
    setBody(null);
    try {
      const data = await fetchEdgeJson<{ messages?: MailMessage[] }>("hostinger-mail", {
        action: "list",
        folder: nextFolder,
        page: 1,
      });
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (err) {
      if (isNotConfigured(err)) {
        setNotConfigured(true);
        return;
      }
      setMessages([]);
      toast.error(toAdminUserMessage(err, undefined, "AdminMail.list"));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.configured) return;
    void loadFolders(true);
  }, [status?.configured, loadFolders]);

  useEffect(() => {
    if (!status?.configured) return;
    void loadMessages(folder);
  }, [status?.configured, folder, loadMessages]);

  const selected = useMemo(
    () => messages.find((m) => m.uid === selectedUid) ?? null,
    [messages, selectedUid],
  );

  async function openMessage(msg: MailMessage) {
    setSelectedUid(msg.uid);
    setReadLoading(true);
    setBody(null);
    try {
      const data = await fetchEdgeJson<MailBody>("hostinger-mail", {
        action: "text",
        folder,
        uid: msg.uid,
      });
      setBody({ text: data.text ?? "", html: data.html ?? "" });
      if (msg.unseen) {
        void fetchEdgeJson("hostinger-mail", {
          action: "flags",
          folder,
          uid: msg.uid,
          addFlags: ["\\Seen"],
        }).then(() => {
          setMessages((prev) =>
            prev.map((row) => (row.uid === msg.uid ? { ...row, unseen: false } : row)),
          );
        });
      }
    } catch (err) {
      toast.error(toAdminUserMessage(err, undefined, "AdminMail.read"));
    } finally {
      setReadLoading(false);
    }
  }

  function startCompose(reply = false) {
    if (reply && selected) {
      setTo(selected.from?.address ?? "");
      const sub = selected.subject ?? "";
      setSubject(sub.toLowerCase().startsWith("re:") ? sub : `Re: ${sub || "(no subject)"}`);
      setReplyUid(selected.uid);
    } else {
      setTo("");
      setSubject("");
      setReplyUid(null);
    }
    setText("");
    setComposeOpen(true);
  }

  async function sendMail() {
    if (!to.trim() || !subject.trim()) {
      toast.error("To and subject are required.");
      return;
    }
    setSending(true);
    try {
      await fetchEdgeJson("hostinger-mail", {
        action: "send",
        to: to.trim(),
        subject: subject.trim(),
        text: text.trim() || subject.trim(),
        inReplyTo: replyUid ? { uid: replyUid, folder } : undefined,
      });
      toast.success("Message sent.");
      setComposeOpen(false);
      setText("");
      void loadMessages(folder === "INBOX.Sent" ? folder : "INBOX.Sent");
      if (folder !== "INBOX.Sent") setFolder("INBOX.Sent");
    } catch (err) {
      toast.error(toAdminUserMessage(err, undefined, "AdminMail.send"));
    } finally {
      setSending(false);
    }
  }

  const lastFetch = status?.fetchedAt
    ? formatDistanceToNow(new Date(status.fetchedAt), { addSuffix: true })
    : "—";

  if (statusLoading && !status) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-foreground">Mail</h1>
        <SkeletonCard />
      </div>
    );
  }

  if (notConfigured || status?.configured === false) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-foreground">Mail</h1>
        <EmptyState
          icon={Mail}
          title="Hostinger Mail is not configured"
          description="Set HOSTINGER_MAIL_API_TOKEN as a Supabase Edge secret (never in the browser or git). The mailbox is hello@trycareerpilot.com."
          actionLabel="Retry"
          onAction={() => void loadStatus()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Mail</h1>
          <p className="text-xs text-muted-foreground">
            hello@trycareerpilot.com via Hostinger Mail API. The API token is never shown here.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => startCompose(false)}>
            Compose
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void loadStatus();
              if (status?.configured) void loadMessages(folder);
            }}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {error && <InlineErrorRetry message={error} onRetry={() => void loadStatus()} />}

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <Badge variant={status?.configured ? "emerald" : "amber"}>
            {status?.configured ? "Configured" : "Not configured"}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Address</p>
            <p className="font-medium">{status?.address || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Quota</p>
            <p className="font-medium">
              {typeof status?.quotaPercent === "number" ? `${status.quotaPercent}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last fetch</p>
            <p className="font-medium">{lastFetch}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last error</p>
            <p className={cn("font-medium", status?.lastError && "text-destructive")}>
              {status?.lastError || "None"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[200px_1fr_1.2fr]">
        <Card padding="sm">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold text-muted-foreground">Folders</p>
            <Button
              variant="ghost"
              size="xs"
              loading={ensuringFolders}
              onClick={async () => {
                setEnsuringFolders(true);
                try {
                  await loadFolders(true);
                } finally {
                  setEnsuringFolders(false);
                }
              }}
            >
              Create tracking
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            {(() => {
              const rows = folders.length
                ? folders
                : [{ path: "INBOX", name: "INBOX" }, { path: "INBOX.Sent", name: "Sent" }];
              const system = rows.filter((item) => !isTrackingFolder(item));
              const tracking = rows.filter((item) => isTrackingFolder(item));
              const renderFolder = (item: MailFolder) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => setFolder(item.path)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-left text-sm",
                    folder === item.path ? "bg-primary/10 text-primary" : "hover:bg-secondary",
                  )}
                >
                  {isTrackingFolder(item) ? trackingFolderLabel(item) : item.name || item.path}
                  {typeof item.unreadCount === "number" && item.unreadCount > 0 ? (
                    <span className="ml-1 text-xs text-muted-foreground">({item.unreadCount})</span>
                  ) : null}
                </button>
              );
              return (
                <>
                  {system.map(renderFolder)}
                  {tracking.length > 0 && (
                    <>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-2 px-2.5">
                        Tracking
                      </p>
                      {tracking.map(renderFolder)}
                    </>
                  )}
                  {tracking.length === 0 && (
                    <p className="text-[11px] text-muted-foreground px-2.5 pt-1">
                      Tracking folders ({HOSTINGER_TRACKING_FOLDERS.map((f) => f.label).join(", ")}) are created on first load.
                    </p>
                  )}
                  {tracking.length > 0 && (
                    <p className="text-[11px] text-muted-foreground px-2.5 pt-1" data-testid="mail-tracking-empty-hint">
                      Tracking folders stay empty until mail is filed into them — they are labels for ops, not auto-sorted inboxes.
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </Card>

        <Card padding="sm">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Messages</p>
          {listLoading ? (
            <p className="text-xs text-muted-foreground">Loading messages…</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="mail-folder-empty">
              {isTrackingFolder({ path: folder, name: folder })
                ? "No messages here yet. Tracking folders are empty until ops files mail into them."
                : "No messages in this folder."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {messages.map((msg) => (
                <li key={msg.uid}>
                  <button
                    type="button"
                    onClick={() => void openMessage(msg)}
                    className={cn(
                      "w-full px-2 py-2 text-left",
                      selectedUid === msg.uid ? "bg-primary/5" : "hover:bg-secondary/60",
                    )}
                  >
                    <p className={cn("text-sm truncate", msg.unseen && "font-semibold")}>
                      {msg.subject || "(no subject)"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {formatFrom(msg.from)}
                      {msg.unseen ? " · unread" : ""}
                      {msg.date
                        ? ` · ${formatDistanceToNow(new Date(msg.date), { addSuffix: true })}`
                        : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground">Read</p>
            {selected && (
              <Button variant="ghost" size="xs" onClick={() => startCompose(true)}>
                <Reply className="w-3 h-3 mr-1" />
                Reply
              </Button>
            )}
          </div>
          {readLoading ? (
            <p className="text-xs text-muted-foreground">Loading message…</p>
          ) : !selected ? (
            <p className="text-xs text-muted-foreground">Select a message to read it.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{selected.subject || "(no subject)"}</p>
              <p className="text-xs text-muted-foreground">{formatFrom(selected.from)}</p>
              {body?.html ? (
                <iframe
                  title="Message body"
                  sandbox=""
                  className="w-full min-h-[240px] rounded-lg border border-border bg-white"
                  srcDoc={sanitizeMailHtml(body.html)}
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-foreground">
                  {body?.text || "(no text body)"}
                </pre>
              )}
            </div>
          )}
        </Card>
      </div>

      {composeOpen && (
        <Card>
          <CardHeader>
            <CardTitle>{replyUid ? "Reply" : "Compose"}</CardTitle>
            <Button variant="ghost" size="xs" onClick={() => setComposeOpen(false)}>
              Close
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              aria-label="To"
              placeholder="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <Input
              aria-label="Subject"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              aria-label="Message"
              placeholder="Message"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button loading={sending} onClick={() => void sendMail()}>
              <Send className="w-3.5 h-3.5 mr-1" />
              Send
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
