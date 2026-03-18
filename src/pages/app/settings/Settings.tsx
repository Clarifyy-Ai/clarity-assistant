// @ts-nocheck
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  User, Bell, Shield, CreditCard,
  Zap, Palette, Download, Trash2,
  ChevronRight, Globe, Mic,
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
  { to: "/app/settings/subscription",   icon: CreditCard,  label: "Subscription"    },
  { to: "/app/settings/credits",        icon: Zap,         label: "Credits"         },
  { to: "/app/settings/integrations",   icon: Globe,       label: "Integrations"    },
  { to: "/app/settings/data",           icon: Download,    label: "Data & export"   },
  { to: "/app/settings/danger",         icon: Trash2,      label: "Danger zone",    danger: true },
];

export default function Settings() {
  const { pathname } = useLocation();
  const isRoot = pathname === "/app/settings";

  return (
    <div className="flex gap-6 max-w-5xl">

      {/* Sidebar */}
      <aside className="w-52 shrink-0 hidden md:block">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-3">
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
                      ? "bg-red-500/10 text-red-400"
                      : "bg-violet-600/15 text-violet-300"
                    : item.danger
                    ? "text-red-500 hover:bg-red-500/5"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isRoot ? (
          /* Mobile: show all links as list */
          <div className="md:hidden space-y-1">
            {SETTINGS_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 p-4 rounded-2xl bg-white/3 border border-white/8",
                  "hover:bg-white/5 transition-all",
                  item.danger && "border-red-500/15"
                )}
              >
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                  item.danger
                    ? "bg-red-500/10"
                    : "bg-white/5"
                )}>
                  <item.icon className={cn(
                    "w-4 h-4",
                    item.danger ? "text-red-400" : "text-gray-400"
                  )} />
                </div>
                <span className={cn(
                  "text-sm font-medium flex-1",
                  item.danger ? "text-red-400" : "text-white"
                )}>
                  {item.label}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </NavLink>
            ))}
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
}
