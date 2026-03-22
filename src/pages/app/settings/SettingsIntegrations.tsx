// @ts-nocheck
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Globe, Calendar, Linkedin, Github,
  Slack, Chrome, ExternalLink,
  Zap, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// SettingsIntegrations
// ─────────────────────────────────────────────────────────────────

const INTEGRATIONS = [
  {
    id:     "google_calendar",
    icon:   Calendar,
    label:  "Google Calendar",
    desc:   "Sync scheduled interviews directly from your Google Calendar.",
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
    bg:     "bg-white/8",
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

export default function SettingsIntegrations() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.provider_token) {
        setCalendarConnected(true);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const calendarParam = searchParams.get("calendar");
    if (calendarParam === "connected") {
      toast.success("Google Calendar connected!");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCalendarConnect() {
    await connectGoogle();
  }

  async function handleCalendarDisconnect() {
    const result = await disconnect();
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.info("Google Calendar disconnected.");
    }
  }

  async function handleCalendarSync() {
    const result = await syncNow();
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Synced! ${result.imported} new interview${result.imported !== 1 ? "s" : ""} imported.`);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Integrations</h2>

      <div className="space-y-3">
        {INTEGRATIONS.map((int) => {
          const isComingSoon = int.status === "coming_soon";

          if (int.id === "google_calendar") {
            return (
              <Card key={int.id}>
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    int.bg
                  )}>
                    <int.icon className={cn("w-5 h-5", int.color)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{int.label}</p>
                      {isConnected && (
                        <Badge variant="emerald" size="sm" dot>Connected</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {isConnected
                        ? "Your calendar is linked. Use Sync to import upcoming interview events."
                        : int.desc}
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
                        onClick={handleCalendarSync}
                        leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      >
                        Sync now
                      </Button>
                    )}
                    <Button
                      variant={isConnected ? "danger" : "secondary"}
                      size="sm"
                      loading={isDisconnecting || isCheckingConnection}
                      onClick={isConnected ? handleCalendarDisconnect : handleCalendarConnect}
                      leftIcon={
                        isConnected
                          ? undefined
                          : <ExternalLink className="w-3.5 h-3.5" />
                      }
                    >
                      {isCheckingConnection
                        ? "…"
                        : isConnected
                        ? "Disconnect"
                        : "Connect"}
                    </Button>
                  </div>
                </div>

                {isConnected && (
                  <div className="mt-3 pt-3 border-t border-white/8">
                    <p className="text-[10px] text-muted-foreground mb-1.5">
                      Permissions granted:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="blue" size="sm">Read calendar events</Badge>
                      <Badge variant="blue" size="sm">Import interviews</Badge>
                    </div>
                  </div>
                )}

                {!isConnected && (
                  <div className="mt-3 pt-3 border-t border-white/8">
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Connects via Google OAuth. Only upcoming events with interview-related keywords are imported. Read-only access — Clarify AI never modifies your calendar.
                    </p>
                  </div>
                )}
              </Card>
            );
          }

          return (
            <Card
              key={int.id}
              className={cn(isComingSoon && "opacity-70")}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  int.bg
                )}>
                  <int.icon className={cn("w-5 h-5", int.color)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{int.label}</p>
                    {isComingSoon && (
                      <Badge variant="default" size="sm">Coming soon</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {int.desc}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

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
            className="flex-1 bg-black/30 border border-white/10 text-muted-foreground rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none"
          />
          <Button variant="secondary" size="sm">
            Reveal
          </Button>
          <Button variant="secondary" size="sm">
            Regenerate
          </Button>
        </div>
      </Card>
    </div>
  );
}
