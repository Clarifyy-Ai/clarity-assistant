import {
  type ComponentType,
  type SVGProps,
  useEffect,
} from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Mic,
  ClipboardList,
  FlaskConical,
  BarChart2,
  FileText,
  BookOpen,
  CalendarDays,
  Building2,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Star,
  Users,
  Bell,
  Briefcase,
  ListTodo,
  PenTool,
  FolderOpen,
  FileSpreadsheet,
  BarChart3,
  Calendar,
  Building,
  Inbox,
  Wrench,
  BookMarked,
  ShieldAlert,
  CreditCard,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";


import {
  STEALTH_NAV_LABELS,
  STEALTH_SECTION_LABELS,
  STEALTH_BRAND,
} from "@/lib/stealth/stealthConfig";

import type { ProfileRow } from "@/types";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  to: string;
  icon: IconComponent;
  stealthIcon: IconComponent;
  label: string;
  exact?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type SidebarLinkProps = {
  to: string;
  icon: IconComponent;
  label: string;
  collapsed: boolean;
  exact?: boolean;
  stealth?: boolean;
  onClick?: () => void;
};

interface AppSidebarProps {
  onNavClick?: () => void;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Core",
    items: [
      {
        to: "/app/dashboard",
        icon: LayoutDashboard,
        stealthIcon: Briefcase,
        label: "Dashboard",
      },
      {
        to: "/app/live",
        icon: Mic,
        stealthIcon: ListTodo,
        label: "Live Co-Pilot",
      },
      {
        to: "/app/mock",
        icon: ClipboardList,
        stealthIcon: PenTool,
        label: "Mock Interview",
      },
      {
        to: "/app/prep",
        icon: FlaskConical,
        stealthIcon: FolderOpen,
        label: "Prep Lab",
      },
      {
        to: "/app/mock-test",
        icon: ClipboardList,
        stealthIcon: PenTool,
        label: "Gov Exam Mock Tests",
      },
    ],
  },
  {
    label: "Growth",
    items: [
      {
        to: "/app/sessions",
        icon: Star,
        stealthIcon: FileSpreadsheet,
        label: "Call Sessions",
      },
      {
        to: "/app/analytics",
        icon: BarChart2,
        stealthIcon: BarChart3,
        label: "Analytics",
      },
      {
        to: "/app/usage",
        icon: CreditCard,
        stealthIcon: BarChart3,
        label: "Usage",
      },
      {
        to: "/app/debrief",
        icon: BookMarked,
        stealthIcon: Inbox,
        label: "Debrief",
      },
      {
        to: "/app/referrals",
        icon: Star,
        stealthIcon: Star,
        label: "Referrals",
      },
      {
        to: "/app/documents",
        icon: FileText,
        stealthIcon: FileText,
        label: "Documents",
      },
      {
        to: "/app/answers",
        icon: BookOpen,
        stealthIcon: FolderOpen,
        label: "Answer Bank",
      },
    ],
  },
  {
    label: "Planner",
    items: [
      {
        to: "/app/interview-day",
        icon: CalendarDays,
        stealthIcon: Calendar,
        label: "Interview Day",
      },
      {
        to: "/app/interviews",
        icon: CalendarDays,
        stealthIcon: Calendar,
        label: "Interviews",
      },
      {
        to: "/app/companies",
        icon: Building2,
        stealthIcon: Building,
        label: "Companies",
      },
      {
        to: "/app/rooms",
        icon: Users,
        stealthIcon: Users,
        label: "Practice Rooms",
      },
    ],
  },
];

function getProfileInitial(profile: ProfileRow | null | undefined): string {
  const fullNameInitial = profile?.full_name?.trim()?.charAt(0)?.toUpperCase();

  if (fullNameInitial) {
    return fullNameInitial;
  }

  const emailInitial = profile?.email?.trim()?.charAt(0)?.toUpperCase();

  return emailInitial || "U";
}

function getPlanLabel(profile: ProfileRow | null | undefined): string {
  const planId = profile?.plan_id;

  if (typeof planId === "string" && planId.trim().length > 0) {
    return planId;
  }

  return "free";
}

function isPathActive(currentPath: string, itemPath: string): boolean {
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function AppSidebar({ onNavClick }: AppSidebarProps = {}): JSX.Element {
  const location = useLocation();

  const sidebarCollapsed = useUIStore((state) => state.sidebar_collapsed);
  const stealthMode = useUIStore((state) => state.stealth_mode);
  const setSidebarCollapsed = useUIStore(
    (state) => state.setSidebarCollapsed
  );
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  const profile = useAuthStore((state) => state.profile);
  
  const signOut = useAuthStore((state) => state.signOut);

  const collapsed = onNavClick ? false : sidebarCollapsed;
  const isAdmin = profile?.is_admin === true;
  const initial = getProfileInitial(profile);
  const planLabel = getPlanLabel(profile);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      if (!event.matches) {
        setSidebarCollapsed(true);
      } else {
        setSidebarCollapsed(false);
      }
    };

    handleChange(mediaQuery);

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [setSidebarCollapsed]);

  // Mock-test question count badge removed alongside section de-scoping.

  async function handleLogout(): Promise<void> {
    try {
      await signOut();
      window.location.href = "/login";
    } catch (error) {
      console.error("[AppSidebar] Sign out failed:", error);
    }
  }

  return (
    <aside
      className={cn(
        "flex flex-col flex-shrink-0",
        onNavClick ? "flex" : "hidden md:flex",
        "h-screen bg-sidebar-background border-r border-sidebar-border",
        "transition-all duration-200 relative z-30",
        onNavClick ? "w-56" : collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex min-h-[56px] items-center gap-3 border-b border-sidebar-border px-4 py-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            stealthMode ? "bg-blue-600" : "bg-violet-600"
          )}
        >
          {stealthMode ? (
            <Briefcase className="h-5 w-5 text-white" />
          ) : (
            <Mic className="h-5 w-5 text-white" />
          )}
        </div>

        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
            {stealthMode ? STEALTH_BRAND.name : "Clarify AI"}
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {stealthMode
                  ? STEALTH_SECTION_LABELS[section.label] ?? section.label
                  : section.label}
              </p>
            )}

            {section.items.map((item) => {
              const isItemActive = isPathActive(location.pathname, item.to);
              const Icon = stealthMode ? item.stealthIcon : item.icon;

              return (
                <div key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.exact}
                    title={collapsed ? item.label : undefined}
                    onClick={onNavClick}
                    className={({ isActive }) => {
                      const active =
                        isActive &&
                        (location.pathname === item.to ||
                          location.pathname.startsWith(`${item.to}/`));

                      return cn(
                        "mx-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                        active || isItemActive
                          ? stealthMode
                            ? "border border-blue-500/20 bg-blue-600/15 text-blue-600 dark:text-blue-300"
                            : "border border-violet-500/20 bg-violet-600/15 text-violet-600 dark:text-violet-300"
                          : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                        collapsed && "justify-center"
                      );
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />

                    {!collapsed && (
                      <span className="truncate flex-1">
                        {stealthMode
                          ? STEALTH_NAV_LABELS[item.label] ?? item.label
                          : item.label}
                      </span>
                    )}
                  </NavLink>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border py-3">
        <SidebarLink
          to="/app/guide"
          icon={BookMarked}
          label="Guide"
          collapsed={collapsed}
          stealth={stealthMode}
          onClick={onNavClick}
        />

        <SidebarLink
          to="/app/notifications"
          icon={stealthMode ? Inbox : Bell}
          label={stealthMode ? "Inbox" : "Notifications"}
          collapsed={collapsed}
          stealth={stealthMode}
          onClick={onNavClick}
        />

        <SidebarLink
          to="/app/settings"
          icon={stealthMode ? Wrench : Settings}
          label={stealthMode ? "Preferences" : "Settings"}
          collapsed={collapsed}
          stealth={stealthMode}
          onClick={onNavClick}
        />

        {isAdmin && (
          <SidebarLink
            to="/app/admin"
            icon={ShieldAlert}
            label="Admin Panel"
            collapsed={collapsed}
            stealth={stealthMode}
            onClick={onNavClick}
          />
        )}

        <div
          className={cn(
            "mx-1 flex items-center gap-2 rounded-xl px-3 py-2 transition-all hover:bg-accent/10",
            collapsed && "justify-center"
          )}
        >
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
              stealthMode ? "bg-blue-600" : "bg-violet-700"
            )}
          >
            {initial}
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-sidebar-foreground">
                {profile?.full_name ?? "User"}
              </p>

              <p className="text-[10px] capitalize text-muted-foreground">
                {planLabel}
              </p>
            </div>
          )}

          {!collapsed && (
            <button
              type="button"
              onClick={() => void handleLogout()}
              title="Sign out"
              aria-label="Sign out"
              className="p-1 text-muted-foreground transition-colors hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {!onNavClick && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="absolute -right-3 top-20 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-sidebar-background text-muted-foreground transition-colors hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>
      )}
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
  onClick,
}: SidebarLinkProps): JSX.Element {
  return (
    <NavLink
      to={to}
      end={exact}
      title={collapsed ? label : undefined}
      onClick={onClick}
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
