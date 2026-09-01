import { useEffect } from "react";
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
    desc:   "Connect Google Calendar to create, update, and cancel interview events.",
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
    desc:   "Connect Career Pilot to 5,000+ apps via Zapier workflows.",
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
    isConnecting,
    isCheckingConnection,
    isProbingSync,
    isConnected,
    reauthRequired,
    connectionStatus,
    googleEmail,
    syncAvailable,
    lastSynced,
    importedCount,
    error,
  } = useCalendarSync();
  const [searchParams, setSearchParams] = useSearchParams();

  const showSyncError =
    Boolean(error) && !isSyncing && !isCalendarNotConfiguredMessage(error ?? "");

  useEffect(() => {
    if (!integration.live) return;
    const flag = searchParams.get("calendar");
    if (!flag) return;

    if (flag === "connected") {
      if (isProbingSync || isCheckingConnection) return;
      if (isConnected) {
        toast.success("Google Calendar connected.");
      } else {
        toast.error("Google Calendar was not connected. Please try again.");
      }
      setSearchParams({}, { replace: true });
      return;
    }

    if (flag === "denied") {
      toast.info("Google Calendar permission was not granted.");
      setSearchParams({}, { replace: true });
      return;
    }

    if (flag === "error") {
      const code = searchParams.get("code");
      toast.error(
        code === "REAUTH_REQUIRED"
          ? "Google Calendar needs to be reconnected."
          : "Google Calendar authorization failed.",
      );
      setSearchParams({}, { replace: true });
    }
  }, [
    integration.live,
    searchParams,
    setSearchParams,
    isConnected,
    isProbingSync,
    isCheckingConnection,
  ]);

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
        toast.info(
          "Google Calendar sync is not configured on the server (missing Google OAuth secrets).",
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
            {connectionStatus === "connected" && (
              <Badge variant="emerald" size="sm" dot>Connected</Badge>
            )}
            {connectionStatus === "reauth_required" && (
              <Badge variant="amber" size="sm">Reconnect required</Badge>
            )}
            {connectionStatus === "not_configured" && (
              <Badge variant="amber" size="sm">Not configured</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {connectionStatus === "connected"
              ? `Calendar is connected${googleEmail ? ` (${googleEmail})` : ""}. Interview events can be created, updated, and cancelled.`
              : connectionStatus === "reauth_required"
                ? "Google Calendar access was revoked or expired. Reconnect to continue syncing events."
                : syncAvailable
                  ? integration.desc
                  : "Google Calendar is not configured. Connect is available only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set on the server."}
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
            <Button variant="ghost" size="sm" disabled title="Calendar sync is not configured">
              Not configured
            </Button>
          ) : isConnected ? (
            <Button
              variant="danger"
              size="sm"
              loading={isDisconnecting || isCheckingConnection}
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              loading={isConnecting || isCheckingConnection}
              onClick={handleConnect}
              leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              {isCheckingConnection ? "…" : reauthRequired ? "Reconnect" : "Connect"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        {!syncAvailable ? (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Calendar is not configured on the server. There is no active Connect until Google OAuth secrets are set — schedule interviews in Career Pilot without a Google event for now.
          </p>
        ) : isConnected ? (
          <>
            <p className="text-[10px] text-muted-foreground mb-1.5">Permissions granted:</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="blue" size="sm">Create interview events</Badge>
              <Badge variant="blue" size="sm">Update interview events</Badge>
              <Badge variant="blue" size="sm">Cancel interview events</Badge>
            </div>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Connect from Settings. Google Sign-In does not grant Calendar access. Career Pilot will request permission to create, update, and cancel interview events only.
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
