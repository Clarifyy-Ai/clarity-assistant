import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/userStore";
import {
  LayoutDashboard, Mic, ClipboardList, FlaskConical,
  BarChart2, FileText, BookOpen, CalendarDays,
  Building2, Settings, ChevronLeft, ChevronRight,
  LogOut, Star, Users, Bell,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

// ─────────────────────────────────────────────────────────────────
// Nav structure
// ─────────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {
    label: "Core",
    items: [
      { to: "/app",          icon: LayoutDashboard, label: "Dashboard",       exact: true },
      { to: "/app/live",     icon: Mic,             label: "Live Co-Pilot"  },
      { to: "/app/mock",     icon: ClipboardList,   label: "Mock Interview" },
      { to: "/app/prep",     icon: FlaskConical,    label: "Prep Lab"       },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/app/sessions",  icon: Star,         label: "Sessions"        },
      { to: "/app/analytics", icon: BarChart2,    label: "Analytics"       },
      { to: "/app/documents", icon: FileText,     label: "Documents"       },
      { to: "/app/answers",   icon: BookOpen,     label: "Answer Bank"     },
    ],
  },
  {
    label: "Planner",
    items: [
      { to: "/app/interviews",       icon: CalendarDays, label: "Interviews"      },
      { to: "/app/companies",        icon: Building2,    label: "Companies"       },
      { to: "/app/rooms",            icon: Users,        label: "Practice Rooms"  },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// AppSidebar
// ─────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const uiStore   = useUIStore();
  const { profile } = useAuthStore();
  const collapsed = uiStore.sidebarCollapsed;

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-[#0d0d14] border-r border-white/8",
        "flex flex-col transition-all duration-200 z-40",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* ── Logo ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/8 min-h-[64px]">
        <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center shrink-0">
          <Mic className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-white font-bold text-base tracking-tight">
            ConfideQ
          </span>
        )}
      </div>

      {/* ── Nav sections ──────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-4 text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-1">
                {section.label}
              </p>
            )}
            {section.items.map((item) => (
              <SidebarLink
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                collapsed={collapsed}
                exact={item.exact}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* ── Bottom: user + settings ───────────────────── */}
      <div className="border-t border-white/8 py-3 space-y-1">
        <SidebarLink to="/app/notifications" icon={Bell}     label="Notifications" collapsed={collapsed} />
        <SidebarLink to="/app/settings"      icon={Settings} label="Settings"      collapsed={collapsed} />

        {/* User pill */}
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 mx-1 rounded-xl hover:bg-white/5 cursor-pointer transition-all",
          collapsed && "justify-center"
        )}>
          <div className="w-7 h-7 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {profile?.full_name?.[0]?.toUpperCase() ?? "U"}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">
                {profile?.full_name ?? "User"}
              </p>
              <p className="text-[10px] text-gray-500 capitalize">
                {profile?.plan ?? "free"}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-1 text-gray-600 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Collapse toggle ───────────────────────────── */}
      <button
        onClick={() => uiStore.toggleSidebar()}
        className="absolute -right-3 top-20 w-6 h-6 bg-[#0d0d14] border border-white/10 rounded-full flex items-center justify-center text-gray-500 hover:text-white transition-colors z-50"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────
// SidebarLink
// ─────────────────────────────────────────────────────────────────

function SidebarLink({
  to, icon: Icon, label, collapsed, exact,
}: {
  to:        string;
  icon:      React.ElementType;
  label:     string;
  collapsed: boolean;
  exact?:    boolean;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 mx-1 rounded-xl text-sm font-medium transition-all",
          isActive
            ? "bg-violet-600/15 text-violet-300 border border-violet-500/20"
            : "text-gray-500 hover:text-gray-200 hover:bg-white/5",
          collapsed && "justify-center"
        )
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}
