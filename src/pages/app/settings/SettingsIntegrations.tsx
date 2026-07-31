import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card }   from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/Badge";
import {
  Calendar, Linkedin, Github,
  Slack, Chrome, ExternalLink,
  Zap, RefreshCw, Bell,
} from "lucide-react";
import { cn }          from "@/lib/utils";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { toast }       from "sonner";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";

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

const INTEGRATION_ENV_KEYS: Record<string, string | undefined> = {
  linkedin: import.meta.env.VITE_LINKEDIN_OAUTH_CLIENT_ID,
  github: import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID,
  slack: import.meta.env.VITE_SLACK_OAUTH_CLIENT_ID,
  chrome_ext: import.meta.env.VITE_CHROME_EXTENSION_ID,
};

function isIntegrationVisible(integration: Integration): boolean {
  // Soft-hide unfinished ComingSoonCard integrations — only surface live ones.
  // OAuth stubs stay hidden unless marked live (Connect would be misleading).
  if (!integration.live) return false;
  const key = INTEGRATION_ENV_KEYS[integration.id];
  if (key === undefined) return true;
  return typeof key === "string" && key.trim().length > 0;
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
// OAuth integrations — env-gated (no fake "coming soon" for providers)
// ─────────────────────────────────────────────────────────────────

const OAUTH_ENV_KEYS: Record<string, string> = {
  linkedin: "VITE_LINKEDIN_CLIENT_ID",
  github:   "VITE_GITHUB_CLIENT_ID",
  slack:    "VITE_SLACK_CLIENT_ID",
};

function getOAuthClientId(integrationId: string): string {
  const envKey = OAUTH_ENV_KEYS[integrationId];
  if (!envKey) return "";
  const value = import.meta.env[envKey];
  return typeof value === "string" ? value.trim() : "";
}

function OAuthIntegrationCard({ integration }: { integration: Integration }) {
  const clientId = getOAuthClientId(integration.id);
  const configured = Boolean(clientId);

  async function handleConnect() {
    if (!configured) return;
    toast.info(
      `${integration.label} OAuth is configured in the client. Complete the provider callback edge function and token storage in Supabase before production use.`,
      { duration: 5000 },
    );
  }

  return (
    <Card className={configured ? "" : "opacity-90"}>
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
            <Badge variant={configured ? "blue" : "amber"} size="sm">
              {configured ? "Ready to connect" : "Admin setup required"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {integration.desc}
          </p>
        </div>

        <div className="shrink-0">
          <Button
            variant="secondary"
            size="sm"
            disabled={!configured}
            onClick={handleConnect}
            leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
          >
            Connect
          </Button>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {configured
            ? "Client ID detected. Wire the OAuth callback edge function and store tokens in Supabase before enabling for all users."
            : `Configure ${OAUTH_ENV_KEYS[integration.id]} in the frontend env and provider secrets (client ID + secret) in Supabase before enabling OAuth.`}
        </p>
      </div>
    </Card>
  );
}

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

  // Sync import requires server-side Google OAuth creds; assume unavailable until probed.
  const [syncAvailable, setSyncAvailable] = useState(false);

  useEffect(() => {
    if (!integration.live) return;

    let cancelled = false;
    (async () => {
      try {
        await fetchEdgeJson("sync-calendar", { probe: true });
        if (!cancelled) setSyncAvailable(true);
      } catch (err) {
        // Any probe failure → do not claim full sync works (501, auth, network).
        const message = (err instanceof Error ? err.message : "").toLowerCase();
        const notConfigured =
          message.includes("501") ||
          message.includes("not available") ||
          message.includes("not configured") ||
          message.includes("coming soon") ||
          message.includes("isn't available");
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
      const notConfigured =
        result.error.toLowerCase().includes("not available") ||
        result.error.toLowerCase().includes("not configured") ||
        result.error.toLowerCase().includes("coming soon") ||
        result.error.toLowerCase().includes("isn't available") ||
        result.error.includes("501");
      if (notConfigured) {
        setSyncAvailable(false);
        toast.info(
          "Google Calendar sync isn't available yet — server sync is not configured.",
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
            {!syncAvailable && integration.live && (
              <Badge variant="amber" size="sm">Sync coming soon</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {isConnected
              ? syncAvailable
                ? "Your calendar is linked. Use Sync to import upcoming interview events."
                : "Your Google account is linked. Event import will be available once sync is enabled on the server."
              : syncAvailable
                ? integration.desc
                : "Google Calendar sync isn't available yet. Interview import will appear here once the server is configured."}
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
          {/* When sync isn't live, don't present Connect as the primary CTA */}
          {!syncAvailable && !isConnected ? (
            <Button variant="ghost" size="sm" disabled>
              Sync unavailable
            </Button>
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
            Calendar event import isn&apos;t enabled on the server yet. You can still schedule interviews manually in Clarify — Google sync will appear here once it&apos;s available.
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
        {INTEGRATIONS.filter(isIntegrationVisible).map((integration) => {
          if (integration.id === "google_calendar") {
            return (
              <GoogleCalendarCard key={integration.id} integration={integration} />
            );
          }
          if (integration.id in OAUTH_ENV_KEYS) {
            return (
              <OAuthIntegrationCard key={integration.id} integration={integration} />
            );
          }
          return (
            <ComingSoonCard key={integration.id} integration={integration} />
          );
        })}
      </div>
    </SettingsPageShell>
  );
}
