// @ts-nocheck
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  User, Bell, Shield, CreditCard,
  Zap, Palette, Download, Trash2,
  ChevronRight, Globe, Mic, Keyboard, Sparkles, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Settings — sidebar layout wrapper
// ─────────────────────────────────────────────────────────────────

const SETTINGS_NAV = [
  { to: "/app/settings/profile",        icon: User,        label: "Profile"         },
  { to: "/app/settings/notifications",  icon: Bell,        label: "Notifications"   },
  { to: "/app/settings/appearance",     icon: Palette,     label: "Appearance"      },
  { to: "/app/settings/audio",          icon: Mic,         label: "Audio & speech"  },
  { to: "/app/settings/privacy",        icon: Shield,      label: "Privacy"         },
  { to: "/app/settings/security-config", icon: ShieldCheck, label: "Security config" },
  { to: "/app/settings/subscription",   icon: CreditCard,  label: "Subscription"    },
  { to: "/app/settings/credits",        icon: Zap,         label: "Credits"         },
  { to: "/app/settings/integrations",   icon: Globe,       label: "Integrations"    },
  { to: "/app/settings/data",           icon: Download,    label: "Data & export"   },
  { to: "/app/settings/hotkeys",        icon: Keyboard,    label: "Keyboard shortcuts" },
  { to: "/app/settings/polish",         icon: Sparkles,    label: "Advanced"        },
  { to: "/app/settings/danger",         icon: Trash2,      label: "Danger zone",    danger: true },
];

export default function Settings() {
  const { pathname } = useLocation();
  const isRoot = pathname === "/app/settings";

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-5xl">

      {/* Desktop Sidebar */}
      <aside className="w-52 shrink-0 hidden md:block">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-3">
          Settings
        </p>
        <nav className="space-y-0.5">
          {SETTINGS_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all",
                  isActive
                    ? item.danger
                      ? "bg-red-500/10 text-red-500"
                      : "bg-primary/10 text-primary"
                    : item.danger
                    ? "text-red-500 hover:bg-red-500/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile: horizontal scrolling tab bar (shows when not at root) */}
      {!isRoot && (
        <div className="md:hidden -mx-3 px-3 overflow-x-auto scrollbar-hide">
          <nav className="flex gap-1 pb-3 min-w-max">
            {SETTINGS_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                    isActive
                      ? item.danger
                        ? "bg-red-500/10 text-red-500"
                        : "bg-primary/10 text-primary"
                      : item.danger
                      ? "text-red-500 hover:bg-red-500/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )
                }
              >
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isRoot ? (
          /* Mobile: show all links as cards */
          <div className="space-y-1">
            {/* Mobile card list — always visible on root */}
            <div className="md:hidden space-y-1">
              {SETTINGS_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-2xl bg-card border border-border",
                    "hover:bg-secondary/60 transition-all",
                    item.danger && "border-red-500/20"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    item.danger
                      ? "bg-red-500/10"
                      : "bg-secondary"
                  )}>
                    <item.icon className={cn(
                      "w-4 h-4",
                      item.danger ? "text-red-400" : "text-muted-foreground"
                    )} />
                  </div>
                  <span className={cn(
                    "text-sm font-medium flex-1",
                    item.danger ? "text-red-400" : "text-foreground"
                  )}>
                    {item.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </NavLink>
              ))}
            </div>
            {/* Desktop shows outlet directly */}
            <div className="hidden md:block">
              <Outlet />
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
}
