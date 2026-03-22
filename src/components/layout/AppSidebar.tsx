import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/userStore";
import {
  LayoutDashboard, Mic, ClipboardList, FlaskConical,
  BarChart2, FileText, BookOpen, CalendarDays,
  Building2, Settings, ChevronLeft, ChevronRight,
  LogOut, Star, Users, Bell,
  Briefcase, ListTodo, PenTool, FolderOpen,
  FileSpreadsheet, BarChart3, Calendar, Building,
  Inbox, Wrench, GraduationCap, Upload,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import {
  STEALTH_NAV_LABELS,
  STEALTH_SECTION_LABELS,
  STEALTH_BRAND,
} from "@/lib/stealth/stealthConfig";

type NavItem = {
  to: string;
  icon: React.ElementType;
  stealthIcon: React.ElementType;
  label: string;
  exact?: boolean;
  subItems?: Array<{ to: string; icon: React.ElementType; label: string }>;
};

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Core",
    items: [
      { to: "/app/dashboard", icon: LayoutDashboard, stealthIcon: Briefcase, label: "Dashboard" },
      { to: "/app/live", icon: Mic, stealthIcon: ListTodo, label: "Live Co-Pilot" },
      { to: "/app/mock", icon: ClipboardList, stealthIcon: PenTool, label: "Mock Interview" },
      { to: "/app/prep", icon: FlaskConical, stealthIcon: FolderOpen, label: "Prep Lab" },
      {
        to: "/app/mock-test",
        icon: GraduationCap,
        stealthIcon: GraduationCap,
        label: "Mock Tests",
        subItems: [
          { to: "/app/mock-test/my-questions", icon: BookOpen,  label: "Question Bank" },
          { to: "/app/mock-test/upload",       icon: Upload,    label: "Import Questions" },
        ],
      },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/app/sessions", icon: Star, stealthIcon: FileSpreadsheet, label: "Sessions" },
      { to: "/app/analytics", icon: BarChart2, stealthIcon: BarChart3, label: "Analytics" },
      { to: "/app/documents", icon: FileText, stealthIcon: FileText, label: "Documents" },
      { to: "/app/answers", icon: BookOpen, stealthIcon: FolderOpen, label: "Answer Bank" },
    ],
  },
  {
    label: "Planner",
    items: [
      { to: "/app/interviews", icon: CalendarDays, stealthIcon: Calendar, label: "Interviews" },
      { to: "/app/companies", icon: Building2, stealthIcon: Building, label: "Companies" },
      { to: "/app/rooms", icon: Users, stealthIcon: Users, label: "Practice Rooms" },
    ],
  },
];

export function AppSidebar() {
  const uiStore = useUIStore();
  const { profile, clearAuth } = useAuthStore();
  const location = useLocation();
  const collapsed = uiStore.sidebar_collapsed;
  const stealth = uiStore.stealth_mode;

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      clearAuth?.();
      window.location.href = "/login";
    } catch (e) {
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
        "hidden md:flex flex-col flex-shrink-0",
        "h-screen bg-sidebar-background border-r border-sidebar-border",
        "transition-all duration-200 relative z-30",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex min-h-[56px] items-center gap-3 border-b border-sidebar-border px-4 py-4">
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          stealth ? "bg-blue-600" : "bg-violet-600"
        )}>
          {stealth ? (
            <Briefcase className="h-5 w-5 text-white" />
          ) : (
            <Mic className="h-5 w-5 text-white" />
          )}
        </div>
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
            {stealth ? STEALTH_BRAND.name : "Clarify AI"}
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {stealth ? (STEALTH_SECTION_LABELS[section.label] ?? section.label) : section.label}
              </p>
            )}
            {section.items.map((item) => {
              const isSubActive = location.pathname.startsWith(item.to + "/");
              const isExact    = location.pathname === item.to;
              const isActive   = isSubActive || isExact;
              const showSubs   = !collapsed && (isActive || isSubActive) && item.subItems;

              return (
                <div key={item.to}>
                  <SidebarLink
                    to={item.to}
                    icon={stealth ? item.stealthIcon : item.icon}
                    label={stealth ? (STEALTH_NAV_LABELS[item.label] ?? item.label) : item.label}
                    collapsed={collapsed}
                    exact={item.exact}
                    stealth={stealth}
                  />

                  {showSubs && (
                    <div className="ml-7 mt-0.5 space-y-0.5 border-l border-border pl-2">
                      {item.subItems!.map((sub) => {
                        const SubIcon = sub.icon;
                        const subActive = location.pathname === sub.to || location.pathname.startsWith(sub.to + "/");
                        return (
                          <NavLink
                            key={sub.to}
                            to={sub.to}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                              subActive
                                ? stealth
                                  ? "text-blue-600 dark:text-blue-300"
                                  : "text-violet-600 dark:text-violet-300"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <SubIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{sub.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border py-3">
        <SidebarLink
          to="/app/notifications"
          icon={stealth ? Inbox : Bell}
          label={stealth ? "Inbox" : "Notifications"}
          collapsed={collapsed}
          stealth={stealth}
        />
        <SidebarLink
          to="/app/settings"
          icon={stealth ? Wrench : Settings}
          label={stealth ? "Preferences" : "Settings"}
          collapsed={collapsed}
          stealth={stealth}
        />

        <div
          className={cn(
            "mx-1 flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 transition-all hover:bg-accent/10",
            collapsed && "justify-center"
          )}
        >
          <div className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
            stealth ? "bg-blue-600" : "bg-violet-700"
          )}>
            {initial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-sidebar-foreground">
                {profile?.full_name ?? "User"}
              </p>
              <p className="text-[10px] capitalize text-muted-foreground">
                {(profile as any)?.plan ?? "free"}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              className="p-1 text-muted-foreground transition-colors hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => uiStore.toggleSidebar()}
        className="absolute -right-3 top-20 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-sidebar-background text-muted-foreground transition-colors hover:text-foreground"
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

function SidebarLink({
  to,
  icon: Icon,
  label,
  collapsed,
  exact,
  stealth,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  collapsed: boolean;
  exact?: boolean;
  stealth?: boolean;
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
            ? stealth
              ? "border border-blue-500/20 bg-blue-600/15 text-blue-600 dark:text-blue-300"
              : "border border-violet-500/20 bg-violet-600/15 text-violet-600 dark:text-violet-300"
            : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
          collapsed && "justify-center"
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}
