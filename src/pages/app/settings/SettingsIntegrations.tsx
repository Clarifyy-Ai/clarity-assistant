import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card }   from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge }  from "@/components/ui/Badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  Calendar, Linkedin, Github,
  Slack, Chrome, ExternalLink,
  Zap, RefreshCw, CheckCircle,
} from "lucide-react";
import { cn }          from "@/lib/utils";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { CALENDAR_VERIFICATION_PENDING_MSG } from "@/lib/interviews/calendarProbe";
import { toast }       from "sonner";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";
import { SettingsSaveBar } from "@/components/settings/SettingsSaveBar";
import { FeatureKillGate } from "@/components/layout/PlanGate";
import { useAuthStore } from "@/store/userStore";
import {
  mergeNotificationPrefs,
  readCalendarIntegrationPrefs,
  type CalendarIntegrationPrefs,
} from "@/lib/interviews/calendarIntegrationPrefs";

/** Shown when Google returns access_denied (cancel or unverified Testing app). */
export const CALENDAR_OAUTH_DENIED_MESSAGE =
  "Google Calendar was not connected. If Google showed “Access blocked” or verification required, your Google account must be added as an OAuth Test user while Career Pilot is in Testing — ask an admin. Otherwise you cancelled permission.";

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

function GoogleCalendarCard({
  integration,
  autoImport,
}: {
  integration: Integration;
  autoImport: boolean;
}) {
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
    verificationPending,
    connectionStatus,
    googleEmail,
    syncAvailable,
    connectAllowed,
    lastSynced,
    importedCount,
    error,
  } = useCalendarSync();
  const [searchParams, setSearchParams] = useSearchParams();
  const [oauthDeniedBanner, setOauthDeniedBanner] = useState(false);

  const showSyncError =
    Boolean(error) &&
    !isSyncing &&
    !isCalendarNotConfiguredMessage(error ?? "") &&
    error !== CALENDAR_VERIFICATION_PENDING_MSG;

  useEffect(() => {
    if (!integration.live) return;
    const flag = searchParams.get("calendar");
    if (!flag) return;

    if (flag === "connected") {
      if (isProbingSync || isCheckingConnection) return;
      if (isConnected) {
        toast.success("Google Calendar connected.");
        setOauthDeniedBanner(false);
      } else {
        toast.error("Google Calendar was not connected. Please try again.");
      }
      setSearchParams({}, { replace: true });
      return;
    }

    if (flag === "denied") {
      setOauthDeniedBanner(true);
      toast.message(CALENDAR_OAUTH_DENIED_MESSAGE);
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
    if (isProbingSync || isCheckingConnection) return;
    if (!syncAvailable) return;
    if (!connectAllowed || verificationPending) {
      toast.info(CALENDAR_VERIFICATION_PENDING_MSG);
      return;
    }
    setOauthDeniedBanner(false);
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
    <div className="space-y-3">
      {oauthDeniedBanner && (
        <Card
          className="border-amber-500/40 bg-amber-500/5"
          data-testid="calendar-oauth-denied-banner"
          role="alert"
        >
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-1">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-amber-200">
                  Google Calendar connection blocked or cancelled
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {CALENDAR_OAUTH_DENIED_MESSAGE}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 self-start"
              onClick={() => setOauthDeniedBanner(false)}
            >
              Dismiss
            </Button>
          </div>
        </Card>
      )}

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
            {connectionStatus === "verification_pending" && (
              <Badge variant="amber" size="sm" data-testid="calendar-verification-pending-badge">
                Verification pending
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {connectionStatus === "connected"
              ? `Calendar is connected${googleEmail ? ` (${googleEmail})` : ""}. Interview events can be created, updated, and cancelled.`
              : connectionStatus === "reauth_required"
                ? "Google Calendar access was revoked or expired. Reconnect to continue syncing events."
                : connectionStatus === "verification_pending"
                  ? CALENDAR_VERIFICATION_PENDING_MSG
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
          {isConnected && syncAvailable && autoImport && (
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
          {connectionStatus === "not_configured" ? (
            <Button variant="ghost" size="sm" disabled title="Calendar sync is not configured">
              Requires Configuration
            </Button>
          ) : isProbingSync || isCheckingConnection ? (
            <Button variant="ghost" size="sm" disabled>
              Checking…
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
          ) : connectionStatus === "verification_pending" || !connectAllowed ? (
            <Button
              variant="ghost"
              size="sm"
              disabled
              data-testid="calendar-connect-gated"
              title={CALENDAR_VERIFICATION_PENDING_MSG}
            >
              Coming soon
            </Button>
          ) : syncAvailable ? (
            <Button
              variant="secondary"
              size="sm"
              loading={isConnecting || isCheckingConnection}
              onClick={handleConnect}
              leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
              data-testid="calendar-connect-cta"
            >
              {reauthRequired ? "Reconnect" : "Connect"}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled title="Calendar sync is not configured">
              Requires Configuration
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
        ) : connectionStatus === "verification_pending" || !connectAllowed ? (
          <p
            className="text-[10px] text-muted-foreground leading-relaxed"
            data-testid="calendar-verification-pending-copy"
          >
            {CALENDAR_VERIFICATION_PENDING_MSG} Manual scheduling in Career Pilot is unchanged.
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Connect from Settings. Google Sign-In does not grant Calendar access. Career Pilot
            requests Google’s sensitive <span className="font-mono">calendar.events</span>{" "}
            permission to create, update, and cancel interview events only. While the app is in
            Google OAuth <strong className="font-medium text-foreground">Testing</strong> (or
            pending verification), only <strong className="font-medium text-foreground">approved
            Test users</strong> can Connect — ask an admin to add your Google account.
          </p>
        )}
      </div>
    </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────

export default function SettingsIntegrations() {
  const { profile, user, updateProfile } = useAuthStore();
  const [prefs, setPrefs] = useState<CalendarIntegrationPrefs>(() =>
    readCalendarIntegrationPrefs(profile),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setPrefs(readCalendarIntegrationPrefs(profile));
  }, [profile]);

  async function handleSave() {
    if (!user) {
      toast.error("Sign in to save integration preferences.");
      return;
    }
    setSaving(true);
    setSaved(false);
    setSaveFailed(false);
    try {
      const existing = (profile as { notification_prefs?: unknown } | null)?.notification_prefs;
      await updateProfile({
        notification_prefs: mergeNotificationPrefs(existing, {
          integrations: {
            calendar_auto_create: prefs.calendar_auto_create,
            calendar_auto_import: prefs.calendar_auto_import,
          },
        }) as never,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Integration preferences saved");
    } catch (err) {
      setSaveFailed(true);
      toast.error(err instanceof Error ? err.message : "Failed to save integration preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPageShell title="Integrations">

      <div className="space-y-3">
        {INTEGRATIONS.filter(isConnectableIntegration).map((integration) => (
          <FeatureKillGate key={integration.id} flag="calendar_sync" compact>
            <GoogleCalendarCard
              integration={integration}
              autoImport={prefs.calendar_auto_import}
            />
          </FeatureKillGate>
        ))}
      </div>

      <Card className="mt-6" data-testid="calendar-preferences-card">
        <h3 className="text-sm font-semibold text-foreground mb-1">Calendar preferences</h3>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          These apply once Google Calendar is connected. You can save them now — they persist after refresh.
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-foreground">Add new interviews to Google Calendar</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When connected, create a calendar event for each interview you schedule.
              </p>
            </div>
            <Switch
              checked={prefs.calendar_auto_create}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, calendar_auto_create: v }))}
              aria-label="Add new interviews to Google Calendar"
              data-testid="calendar-pref-auto-create"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-foreground">Import events when I tap Sync now</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pull matching Google Calendar events into Career Pilot from the Integrations card.
              </p>
            </div>
            <Switch
              checked={prefs.calendar_auto_import}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, calendar_auto_import: v }))}
              aria-label="Import events when I tap Sync now"
              data-testid="calendar-pref-auto-import"
            />
          </div>
        </div>
      </Card>

      <div className="mt-8 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Coming later</h3>
        <p className="text-xs text-muted-foreground">
          These providers are not available to connect yet.
        </p>
        {INTEGRATIONS.filter((i) => !isConnectableIntegration(i)).map((integration) => (
          <ComingSoonCard key={integration.id} integration={integration} />
        ))}
      </div>

      <SettingsSaveBar>
        <Button
          variant={saved ? "success" : saveFailed ? "danger" : "primary"}
          size="md"
          loading={saving}
          onClick={() => void handleSave()}
          leftIcon={saved ? <CheckCircle className="w-4 h-4" /> : undefined}
          data-testid="integrations-save"
        >
          {saving ? "Saving…" : saved ? "Saved!" : saveFailed ? "Failed — retry" : "Save changes"}
        </Button>
      </SettingsSaveBar>
    </SettingsPageShell>
  );
}
