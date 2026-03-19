import { NavLink } from "react-router-dom";
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

type NavItem = {
  to: string;
  icon: React.ElementType;
  label: string;
  exact?: boolean;
};

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Core",
    items: [
      { to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/app/live", icon: Mic, label: "Live Co-Pilot" },
      { to: "/app/mock", icon: ClipboardList, label: "Mock Interview" },
      { to: "/app/prep", icon: FlaskConical, label: "Prep Lab" },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/app/sessions", icon: Star, label: "Sessions" },
      { to: "/app/analytics", icon: BarChart2, label: "Analytics" },
      { to: "/app/documents", icon: FileText, label: "Documents" },
      { to: "/app/answers", icon: BookOpen, label: "Answer Bank" },
    ],
  },
  {
    label: "Planner",
    items: [
      { to: "/app/interviews", icon: CalendarDays, label: "Interviews" },
      { to: "/app/companies", icon: Building2, label: "Companies" },
      { to: "/app/rooms", icon: Users, label: "Practice Rooms" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// AppSidebar
// ─────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const uiStore = useUIStore();
  const { profile, clearAuth } = useAuthStore();
  const collapsed = uiStore.sidebar_collapsed;

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      // Optional: clear any local stores/session state
      clearAuth?.();
      // Optional: also clear other stores if needed (sessionStore, etc.)
      window.location.href = "/auth/login"; // or use navigate('/auth/login')
    } catch (e) {
      // Optionally trigger a toast error
      console.error("Sign out failed:", e);
    }
  }

  const initial =
    profile?.full_name?.trim()?.charAt(0)?.toUpperCase() ??
    profile?.email?.trim()?.charAt(0)?.toUpperCase() ??
    "U";

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-[#0d0d14] border-r border-white/[0.08]",
        "flex flex-col transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* ── Logo ──────────────────────────────────────── */}
      <div className="flex min-h-[64px] items-center gap-3 border-b border-white/[0.08] px-4 py-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600">
          <Mic className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-base font-bold tracking-tight text-white">
            ConfideQ
          </span>
        )}
      </div>

      {/* ── Nav sections ──────────────────────────────── */}
      <nav className="flex-1 space-y-4 overflow-y-auto py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
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
      <div className="space-y-1 border-t border-white/[0.08] py-3">
        <SidebarLink
          to="/app/notifications"
          icon={Bell}
          label="Notifications"
          collapsed={collapsed}
        />
        <SidebarLink
          to="/app/settings"
          icon={Settings}
          label="Settings"
          collapsed={collapsed}
        />

        {/* User pill */}
        <div
          className={cn(
            "mx-1 flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 transition-all hover:bg-white/[0.05]",
            collapsed && "justify-center"
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-700 text-xs font-bold text-white">
            {initial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">
                {profile?.full_name ?? "User"}
              </p>
              <p className="text-[10px] capitalize text-gray-500">
                {profile?.plan ?? "free"}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              className="p-1 text-gray-600 transition-colors hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Collapse toggle ───────────────────────────── */}
      <button
        type="button"
        onClick={() => uiStore.toggleSidebar()}
        className="absolute -right-3 top-20 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.10] bg-[#0d0d14] text-gray-500 transition-colors hover:text-white"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────
// SidebarLink
// ─────────────────────────────────────────────────────────────────

function SidebarLink({
  to,
  icon: Icon,
  label,
  collapsed,
  exact,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  collapsed: boolean;
  exact?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "mx-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
          isActive
            ? "border border-violet-500/20 bg-violet-600/15 text-violet-300"
            : "text-gray-500 hover:bg-white/[0.05] hover:text-gray-200",
          collapsed && "justify-center"
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}
