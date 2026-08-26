import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card }   from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge }  from "@/components/ui/Badge";
import {
  Calendar, Linkedin, Github,
  Slack, Chrome, ExternalLink,
  Zap, RefreshCw,
} from "lucide-react";
import { cn }          from "@/lib/utils";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { toast }       from "sonner";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";
import { FeatureKillGate } from "@/components/layout/PlanGate";

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

function isConnectableIntegration(integration: Integration): boolean {
  return integration.live && integration.id === "google_calendar";
}

const INTEGRATIONS: Integration[] = [
  {
    id:     "google_calendar",
    icon:   Calendar,
    label:  "Google Calendar",
    desc:   "Link Google to import interview events when server sync is enabled.",
    status: "available",
    color:  "text-blue-400",
    bg:     "bg-blue-500/10",
    live:   true,
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
// Coming later — non-interactive (no Connect / Notify actions)
// ─────────────────────────────────────────────────────────────────

function ComingSoonCard({ integration }: { integration: Integration }) {
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
            <Badge variant="default" size="sm">Coming later</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {integration.desc}
          </p>
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

function isCalendarNotConfiguredMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("501") ||
    lower.includes("not_configured") ||
    lower.includes("not available") ||
    lower.includes("not configured") ||
    lower.includes("coming soon") ||
    lower.includes("isn't available")
  );
}

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

  // Sync import requires server-side Google OAuth creds; assume unavailable until probed.
  const [syncAvailable, setSyncAvailable] = useState(false);
  const showSyncError =
    Boolean(error) && !isSyncing && !isCalendarNotConfiguredMessage(error ?? "");

  useEffect(() => {
    if (!integration.live) return;

    let cancelled = false;
    (async () => {
      try {
        await fetchEdgeJson("sync-calendar", { probe: true });
        if (!cancelled) setSyncAvailable(true);
      } catch (err) {
        // Any probe failure → do not claim full sync works (501, auth, network).
        const message = err instanceof Error ? err.message : "";
        const notConfigured = isCalendarNotConfiguredMessage(message);
        if (!cancelled) {
          setSyncAvailable(false);
          if (!notConfigured) {
            // Non-501 failures still mean sync UI must not advertise readiness.
            console.warn("[SettingsIntegrations] sync-calendar probe failed:", message);
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [integration.live]);

  async function handleConnect() {
    const result = await connectGoogle();
    if (result.error) {
      toast.error(result.error);
    }
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
      if (isCalendarNotConfiguredMessage(result.error)) {
        // 501 / NOT_CONFIGURED — calm “coming soon” UI, never a scary error toast.
        setSyncAvailable(false);
        toast.info(
          "Google Calendar sync isn't available yet — coming soon / not configured on the server.",
        );
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
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{integration.label}</p>
            {isConnected && <Badge variant="emerald" size="sm" dot>Connected</Badge>}
            {!syncAvailable && (
              <Badge variant="amber" size="sm">Coming Soon / Not configured</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {isConnected
              ? syncAvailable
                ? "Your calendar is linked. Use Sync to import upcoming interview events."
                : "Your Google account may be linked, but event import is not configured on the server yet."
              : syncAvailable
                ? integration.desc
                : "Google Calendar sync is Coming Soon / Not configured. Connect will appear here only when the server is ready."}
          </p>
          {lastSynced && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Last synced: {lastSynced.toLocaleTimeString()}
              {importedCount !== null && ` · ${importedCount} event${importedCount !== 1 ? "s" : ""} imported`}
            </p>
          )}
          {showSyncError && (
            <p className="text-[10px] text-red-400 mt-0.5" role="alert">{error}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isConnected && syncAvailable && (
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
          {!syncAvailable ? (
            isConnected ? (
              <Button
                variant="danger"
                size="sm"
                loading={isDisconnecting || isCheckingConnection}
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            ) : (
              <Button variant="ghost" size="sm" disabled title="Calendar sync is not configured">
                Coming Soon
              </Button>
            )
          ) : (
            <Button
              variant={isConnected ? "danger" : "secondary"}
              size="sm"
              loading={isDisconnecting || isCheckingConnection}
              onClick={isConnected ? handleDisconnect : handleConnect}
              leftIcon={isConnected ? undefined : <ExternalLink className="w-3.5 h-3.5" />}
            >
              {isCheckingConnection ? "…" : isConnected ? "Disconnect" : "Connect"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        {!syncAvailable ? (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Calendar event import is Coming Soon / Not configured on the server. There is no active Connect until sync is enabled — schedule interviews manually in Clarify for now.
          </p>
        ) : isConnected ? (
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

  useEffect(() => {
    if (searchParams.get("calendar") === "connected") {
      toast.success("Google Calendar connected!");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <SettingsPageShell title="Integrations">

      <div className="space-y-3">
        {INTEGRATIONS.filter(isConnectableIntegration).map((integration) => (
          <FeatureKillGate key={integration.id} flag="calendar_sync" compact>
            <GoogleCalendarCard integration={integration} />
          </FeatureKillGate>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Coming later</h3>
        <p className="text-xs text-muted-foreground">
          These providers are not available to connect yet.
        </p>
        {INTEGRATIONS.filter((i) => !isConnectableIntegration(i)).map((integration) => (
          <ComingSoonCard key={integration.id} integration={integration} />
        ))}
      </div>
    </SettingsPageShell>
  );
}
