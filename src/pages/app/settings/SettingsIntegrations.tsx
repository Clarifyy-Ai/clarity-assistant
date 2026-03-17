import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import {
  Globe, Calendar, Linkedin, Github,
  Slack, Chrome, CheckCircle, ExternalLink,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// SettingsIntegrations
// ─────────────────────────────────────────────────────────────────

const INTEGRATIONS = [
  {
    id:       "google_calendar",
    icon:     Calendar,
    label:    "Google Calendar",
    desc:     "Sync scheduled interviews directly to your Google Calendar.",
    status:   "available",
    color:    "text-blue-400",
    bg:       "bg-blue-500/10",
  },
  {
    id:       "linkedin",
    icon:     Linkedin,
    label:    "LinkedIn",
    desc:     "Import your profile and experience for personalised coaching.",
    status:   "available",
    color:    "text-blue-500",
    bg:       "bg-blue-600/10",
  },
  {
    id:       "github",
    icon:     Github,
    label:    "GitHub",
    desc:     "Link your repos for technical interview context.",
    status:   "available",
    color:    "text-gray-300",
    bg:       "bg-white/8",
  },
  {
    id:       "slack",
    icon:     Slack,
    label:    "Slack",
    desc:     "Get interview reminders and debrief summaries in Slack.",
    status:   "coming_soon",
    color:    "text-emerald-400",
    bg:       "bg-emerald-500/10",
  },
  {
    id:       "chrome_ext",
    icon:     Chrome,
    label:    "Chrome Extension",
    desc:     "One-click practice from any job listing page.",
    status:   "coming_soon",
    color:    "text-amber-400",
    bg:       "bg-amber-500/10",
  },
  {
    id:       "zapier",
    icon:     Zap,
    label:    "Zapier",
    desc:     "Connect Confideq to 5,000+ apps via Zapier workflows.",
    status:   "coming_soon",
    color:    "text-orange-400",
    bg:       "bg-orange-500/10",
  },
];

export default function SettingsIntegrations() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  function toggleConnect(id: string) {
    setConnected((p) => ({ ...p, [id]: !p[id] }));
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white">Integrations</h2>

      <div className="space-y-3">
        {INTEGRATIONS.map((int) => {
          const isConnected    = connected[int.id] ?? false;
          const isComingSoon   = int.status === "coming_soon";

          return (
            <Card
              key={int.id}
              className={cn(isComingSoon && "opacity-70")}
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  int.bg
                )}>
                  <int.icon className={cn("w-5 h-5", int.color)} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{int.label}</p>
                    {isComingSoon && (
                      <Badge variant="default" size="sm">Coming soon</Badge>
                    )}
                    {isConnected && (
                      <Badge variant="emerald" size="sm" dot>Connected</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {int.desc}
                  </p>
                </div>

                {/* Action */}
                {!isComingSoon && (
                  <Button
                    variant={isConnected ? "danger" : "secondary"}
                    size="sm"
                    onClick={() => toggleConnect(int.id)}
                    leftIcon={
                      isConnected
                        ? undefined
                        : <ExternalLink className="w-3.5 h-3.5" />
                    }
                  >
                    {isConnected ? "Disconnect" : "Connect"}
                  </Button>
                )}
              </div>

              {/* Permissions shown when connected */}
              {isConnected && (
                <div className="mt-3 pt-3 border-t border-white/8">
                  <p className="text-[10px] text-gray-600 mb-1.5">
                    Permissions granted:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {int.id === "google_calendar" && (
                      <>
                        <Badge variant="blue" size="sm">Read events</Badge>
                        <Badge variant="blue" size="sm">Create events</Badge>
                      </>
                    )}
                    {int.id === "linkedin" && (
                      <>
                        <Badge variant="blue" size="sm">Read profile</Badge>
                        <Badge variant="blue" size="sm">Read experience</Badge>
                      </>
                    )}
                    {int.id === "github" && (
                      <>
                        <Badge variant="default" size="sm">Public repos</Badge>
                      </>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* API key section */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white">API access</h3>
          <Badge variant="amber" size="sm">Pro</Badge>
        </div>
        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
          Use the Confideq API to build integrations, automate workflows,
          or pull data into your own tools.
        </p>
        <div className="flex gap-3">
          <input
            readOnly
            value="sk-confideq-••••••••••••••••••••••"
            className="flex-1 bg-black/30 border border-white/10 text-gray-500 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none"
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
