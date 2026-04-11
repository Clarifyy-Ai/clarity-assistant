import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card }   from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge }  from "@/components/ui/Badge";
import {
  Calendar, Linkedin, Github,
  Slack, Chrome, ExternalLink,
  Zap, RefreshCw, Bell,
} from "lucide-react";
import { cn }          from "@/lib/utils";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { toast }       from "sonner";

// ─────────────────────────────────────────────────────────────────
// Integration definitions
// ─────────────────────────────────────────────────────────────────

type IntegrationStatus = "available" | "coming_soon";

interface Integration {
  id:     string;
  icon:   React.ElementType;
  label:  string;
  desc:   string;
  status: IntegrationStatus;
  color:  string;
  bg:     string;
  /** true = the backend is wired up and ready; false = show Coming Soon */
  live:   boolean;
}

const INTEGRATIONS: Integration[] = [
  {
    id:     "google_calendar",
    icon:   Calendar,
    label:  "Google Calendar",
    desc:   "Sync scheduled interviews directly from your Google Calendar.",
    status: "available",
    color:  "text-blue-400",
    bg:     "bg-blue-500/10",
    // Set to true once GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are configured
    // and the OAuth consent screen is verified. The UI auto-detects readiness
    // via the 501 response from the edge function.
    live:   false,
  },
  {
    id:     "linkedin",
    icon:   Linkedin,
    label:  "LinkedIn",
    desc:   "Import your profile and experience for personalised coaching.",
    status: "coming_soon",
    color:  "text-blue-500",
    bg:     "bg-blue-600/10",
    live:   false,
  },
  {
    id:     "github",
    icon:   Github,
    label:  "GitHub",
    desc:   "Link your repos for technical interview context.",
    status: "coming_soon",
    color:  "text-foreground",
    bg:     "bg-secondary",
    live:   false,
  },
  {
    id:     "slack",
    icon:   Slack,
    label:  "Slack",
    desc:   "Get interview reminders and debrief summaries in Slack.",
    status: "coming_soon",
    color:  "text-emerald-400",
    bg:     "bg-emerald-500/10",
    live:   false,
  },
  {
    id:     "chrome_ext",
    icon:   Chrome,
    label:  "Chrome Extension",
    desc:   "One-click practice from any job listing page.",
    status: "coming_soon",
    color:  "text-amber-400",
    bg:     "bg-amber-500/10",
    live:   false,
  },
  {
    id:     "zapier",
    icon:   Zap,
    label:  "Zapier",
    desc:   "Connect Clarify AI to 5,000+ apps via Zapier workflows.",
    status: "coming_soon",
    color:  "text-orange-400",
    bg:     "bg-orange-500/10",
    live:   false,
  },
];

// ─────────────────────────────────────────────────────────────────
// Coming-soon card — notify-me button (stored locally to avoid
// a waitlist endpoint dependency)
// ─────────────────────────────────────────────────────────────────

function ComingSoonCard({ integration }: { integration: Integration }) {
  const storageKey     = `clarify_notify_${integration.id}`;
  const [notified, setNotified] = useState(
    () => localStorage.getItem(storageKey) === "1",
  );

  function handleNotify() {
    localStorage.setItem(storageKey, "1");
    setNotified(true);
    toast.success(
      `We'll let you know when ${integration.label} is ready!`,
      { duration: 4000 },
    );
  }

  return (
    <Card className="opacity-80">
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          integration.bg,
        )}>
          <integration.icon className={cn("w-5 h-5", integration.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{integration.label}</p>
            <Badge variant="default" size="sm">Coming soon</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {integration.desc}
          </p>
        </div>

        <div className="shrink-0">
          {notified ? (
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              <Bell className="w-3.5 h-3.5" />
              Notified
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNotify}
              leftIcon={<Bell className="w-3.5 h-3.5" />}
            >
              Notify me
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Google Calendar card — two modes:
//   1. "coming_soon_server" — edge function returned 501 (not configured)
//   2. "live"              — edge function is ready, show connect/sync UI
// ─────────────────────────────────────────────────────────────────

function GoogleCalendarCard({ integration }: { integration: Integration }) {
  const {
    connectGoogle,
    syncNow,
    disconnect,
    isSyncing,
    isDisconnecting,
    isCheckingConnection,
    isConnected,
    lastSynced,
    importedCount,
    error,
  } = useCalendarSync();

  // Tracks whether the server-side feature is actually ready.
  // Starts as the static `live` flag; may be overridden to false
  // if the edge function responds with 501.
  const [serverReady, setServerReady] = useState(integration.live);
  const [notified,    setNotified]    = useState(
    () => localStorage.getItem("clarify_notify_google_calendar") === "1",
  );

  // Probe liveness on mount: attempt a lightweight sync call with no token.
  // A 501 response means the backend isn't configured yet.
  useEffect(() => {
    if (!integration.live) return; // already known to be off — skip the probe

    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import("@/lib/supabase/client");
        const { error: invokeErr } = await supabase.functions.invoke(
          "sync-calendar",
          { body: { probe: true } },
        );
        // Supabase wraps non-2xx as FunctionsHttpError with a `status` field
        const status = (invokeErr as { status?: number } | null)?.status;
        if (!cancelled && status === 501) {
          setServerReady(false);
        }
      } catch {
        // Network error — don't flip the flag, let the user try to connect
      }
    })();
    return () => { cancelled = true; };
  }, [integration.live]);

  // ── Coming-soon state (server not configured) ─────────────────
  if (!serverReady) {
    function handleNotify() {
      localStorage.setItem("clarify_notify_google_calendar", "1");
      setNotified(true);
      toast.success("We'll let you know when Google Calendar sync is ready!", {
        duration: 4000,
      });
    }

    return (
      <Card>
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
            integration.bg,
          )}>
            <integration.icon className={cn("w-5 h-5", integration.color)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{integration.label}</p>
              <Badge variant="amber" size="sm">Coming soon</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {integration.desc}
            </p>
          </div>

          <div className="shrink-0">
            {notified ? (
              <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                <Bell className="w-3.5 h-3.5" />
                Notified
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNotify}
                leftIcon={<Bell className="w-3.5 h-3.5" />}
              >
                Notify me
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Google Calendar sync is in development. We'll import upcoming interview events automatically — read-only access, we never modify your calendar.
          </p>
        </div>
      </Card>
    );
  }

  // ── Live state (server configured) ───────────────────────────
  async function handleConnect() {
    await connectGoogle();
  }

  async function handleDisconnect() {
    const result = await disconnect();
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.info("Google Calendar disconnected.");
    }
  }

  async function handleSync() {
    const result = await syncNow();
    if (result.error) {
      // If the edge function comes back 501 at runtime, flip to coming-soon
      if ((result as { status?: number }).status === 501) {
        setServerReady(false);
        toast.info("Calendar sync isn't available yet — we'll notify you when it's ready.");
        return;
      }
      toast.error(result.error);
    } else {
      toast.success(
        `Synced! ${result.imported} new interview${result.imported !== 1 ? "s" : ""} imported.`,
      );
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          integration.bg,
        )}>
          <integration.icon className={cn("w-5 h-5", integration.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{integration.label}</p>
            {isConnected && <Badge variant="emerald" size="sm" dot>Connected</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {isConnected
              ? "Your calendar is linked. Use Sync to import upcoming interview events."
              : integration.desc}
          </p>
          {lastSynced && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Last synced: {lastSynced.toLocaleTimeString()}
              {importedCount !== null && ` · ${importedCount} event${importedCount !== 1 ? "s" : ""} imported`}
            </p>
          )}
          {error && !isSyncing && (
            <p className="text-[10px] text-red-400 mt-0.5">{error}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isConnected && (
            <Button
              variant="secondary"
              size="sm"
              loading={isSyncing}
              onClick={handleSync}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync now
            </Button>
          )}
          <Button
            variant={isConnected ? "danger" : "secondary"}
            size="sm"
            loading={isDisconnecting || isCheckingConnection}
            onClick={isConnected ? handleDisconnect : handleConnect}
            leftIcon={isConnected ? undefined : <ExternalLink className="w-3.5 h-3.5" />}
          >
            {isCheckingConnection ? "…" : isConnected ? "Disconnect" : "Connect"}
          </Button>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        {isConnected ? (
          <>
            <p className="text-[10px] text-muted-foreground mb-1.5">Permissions granted:</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="blue" size="sm">Read calendar events</Badge>
              <Badge variant="blue" size="sm">Import interviews</Badge>
            </div>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Connects via Google OAuth. Only upcoming events with interview-related keywords are imported. Read-only access — Clarify AI never modifies your calendar.
          </p>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────

export default function SettingsIntegrations() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle ?calendar=connected redirect from OAuth flow
  useEffect(() => {
    if (searchParams.get("calendar") === "connected") {
      toast.success("Google Calendar connected!");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Integrations</h2>

      <div className="space-y-3">
        {INTEGRATIONS.map((integration) => {
          if (integration.id === "google_calendar") {
            return (
              <GoogleCalendarCard key={integration.id} integration={integration} />
            );
          }
          return (
            <ComingSoonCard key={integration.id} integration={integration} />
          );
        })}
      </div>

      {/* API access card */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-foreground">API access</h3>
          <Badge variant="amber" size="sm">Pro</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Use the Clarify AI API to build integrations, automate workflows,
          or pull data into your own tools.
        </p>
        <div className="flex gap-3">
          <input
            readOnly
            value="sk-clarify-••••••••••••••••••••••"
            className="flex-1 bg-background border border-input text-muted-foreground rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none"
          />
          <Button variant="secondary" size="sm">Reveal</Button>
          <Button variant="secondary" size="sm">Regenerate</Button>
        </div>
      </Card>
    </div>
  );
}
