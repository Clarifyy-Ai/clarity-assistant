import {
  type ComponentType,
  type SVGProps,
  useEffect,
  useState,
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
  Phone,
  Gift,
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
  Star,
  GraduationCap,
  Award,
  Coins,
  CalendarCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { BrandLogo } from "@/components/marketing";

import {
  STEALTH_NAV_LABELS,
  STEALTH_SECTION_LABELS,
  STEALTH_BRAND,
} from "@/lib/stealth/stealthConfig";

import type { FeatureFlagId, ProfileRow } from "@/types";
import { getPlanDisplayName } from "@/lib/constants/pricing";
import { PRODUCT_NAMES, NAV_SECTION_LABELS } from "@/lib/constants/productNames";
import { COMMUNITY_MODULE_LABEL } from "@/lib/community/moderation";
import { assignLoginWithReturnTo } from "@/lib/auth/safeReturnTo";
import { useIndiaRegion } from "@/hooks/useIndiaRegion";
import { useGlobalStore } from "@/store/globalStore";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  to: string;
  icon: IconComponent;
  stealthIcon: IconComponent;
  label: string;
  exact?: boolean;
  tourId?: string;
  /** Show for everyone; lock + India badge when region gate would bounce. */
  indiaOnly?: boolean;
  /** Kill-switch flag. Hidden when enabled=false; plan-deny still shows for upsell. */
  featureFlag?: FeatureFlagId;
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
  onMouseEnter?: () => void;
};

/** Prefetch heavy route chunks on sidebar hover / focus. */
const ROUTE_PREFETCH: Record<string, () => Promise<unknown>> = {
  "/app/dashboard": () => import("@/pages/app/Dashboard"),
  "/app/live": () => import("@/pages/app/live/LiveRehearsal"),
  "/app/mock": () => import("@/pages/app/mock/MockInterview"),
  "/app/prep": () => import("@/pages/app/prep/PrepLab"),
  "/app/mock-test": () => import("@/pages/app/mock-test/MockTestHub"),
  "/app/assessments": () => import("@/pages/app/assessments/AssessmentTemplates"),
  "/app/learn": () => import("@/pages/app/learn/LearningHub"),
  "/app/practice-workspace": () => import("@/pages/app/practice/PracticeWorkspace"),
  "/app/plan": () => import("@/pages/app/plan/InterviewPracticePlan"),
  "/app/analytics": () => import("@/pages/app/Analytics"),
  "/app/companies": () => import("@/pages/app/company-research/CompanyResearch"),
  "/app/answers": () => import("@/pages/app/answer-bank/AnswerBank"),
  "/app/settings": () => import("@/pages/app/settings/Settings"),
  "/app/admin": () => import("@/pages/app/admin/AdminDashboard"),
};

interface AppSidebarProps {
  onNavClick?: () => void;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: NAV_SECTION_LABELS.core,
    items: [
      {
        to: "/app/dashboard",
        icon: LayoutDashboard,
        stealthIcon: Briefcase,
        label: PRODUCT_NAMES.dashboard,
      },
      {
        to: "/app/live",
        icon: Mic,
        stealthIcon: ListTodo,
        label: PRODUCT_NAMES.practiceCoach,
        tourId: "nav-practice-coach",
        featureFlag: "overlay",
      },
      {
        to: "/app/mock",
        icon: ClipboardList,
        stealthIcon: PenTool,
        label: PRODUCT_NAMES.mockInterview,
        tourId: "nav-mock-interview",
        featureFlag: "mock_sessions",
      },
      {
        to: "/app/prep",
        icon: FlaskConical,
        stealthIcon: FolderOpen,
        label: PRODUCT_NAMES.prepLab,
        tourId: "nav-prep-lab",
      },
      {
        to: "/app/mock-test",
        icon: GraduationCap,
        stealthIcon: Award,
        label: "Gov Exams",
        indiaOnly: true,
      },
      {
        to: "/app/assessments",
        icon: Award,
        stealthIcon: Award,
        label: "Assessments",
      },
      {
        to: "/app/learn",
        icon: BookOpen,
        stealthIcon: BookOpen,
        label: "Learning Hub",
      },
      {
        to: "/app/practice-workspace",
        icon: ClipboardList,
        stealthIcon: PenTool,
        label: "Practice workspace",
      },
    ],
  },
  {
    label: NAV_SECTION_LABELS.progress,
    items: [
      {
        to: "/app/plan",
        icon: ListTodo,
        stealthIcon: ListTodo,
        label: "Practice plan",
      },
      {
        to: "/app/sessions",
        icon: Phone,
        stealthIcon: Phone,
        label: PRODUCT_NAMES.sessionHistory,
      },
      {
        to: "/app/analytics",
        icon: BarChart2,
        stealthIcon: BarChart3,
        label: PRODUCT_NAMES.analytics,
        featureFlag: "analytics",
      },
      {
        to: "/app/usage",
        icon: CreditCard,
        stealthIcon: Coins,
        label: PRODUCT_NAMES.creditsUsage,
      },
      {
        to: "/app/debriefs",
        icon: BookMarked,
        stealthIcon: Inbox,
        label: PRODUCT_NAMES.debrief,
      },
      {
        to: "/app/referrals",
        icon: Gift,
        stealthIcon: Star,
        label: PRODUCT_NAMES.referrals,
      },
      {
        to: "/app/documents",
        icon: FileText,
        stealthIcon: FileText,
        label: PRODUCT_NAMES.documents,
        tourId: "nav-documents",
      },
      {
        to: "/app/library",
        icon: FolderOpen,
        stealthIcon: FolderOpen,
        label: "Document library",
      },
      {
        to: "/app/question-bank",
        icon: FileSpreadsheet,
        stealthIcon: FileSpreadsheet,
        label: "Question bank",
      },
      {
        to: "/app/community",
        icon: Inbox,
        stealthIcon: Inbox,
        label: COMMUNITY_MODULE_LABEL,
      },
      {
        to: "/app/coding",
        icon: PenTool,
        stealthIcon: PenTool,
        label: "Coding lab",
        featureFlag: "coding_hints",
      },
      {
        to: "/app/answers",
        icon: BookOpen,
        stealthIcon: FolderOpen,
        label: PRODUCT_NAMES.answerBank,
        featureFlag: "answer_bank",
      },
    ],
  },
  {
    label: NAV_SECTION_LABELS.planner,
    items: [
      {
        to: "/app/interview-day",
        icon: CalendarDays,
        stealthIcon: Calendar,
        label: PRODUCT_NAMES.interviewDay,
      },
      {
        to: "/app/interviews",
        icon: CalendarCheck,
        stealthIcon: Calendar,
        label: PRODUCT_NAMES.interviews,
        featureFlag: "calendar_sync",
      },
      {
        to: "/app/companies",
        icon: Building2,
        stealthIcon: Building,
        label: PRODUCT_NAMES.companyResearch,
        featureFlag: "company_research",
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
  return getPlanDisplayName(profile?.plan_id);
}

function isPathActive(currentPath: string, itemPath: string): boolean {
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function AppSidebar({ onNavClick }: AppSidebarProps = {}): JSX.Element {
  const location = useLocation();

  const sidebarCollapsed = useUIStore((state) => state.sidebar_collapsed);
  const stealthMode = useUIStore((state) => state.stealth_mode);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  const profile = useAuthStore((state) => state.profile);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isModerator = useAuthStore((state) => state.isModerator);
  const isStaff = isAdmin || isModerator;
  const { isIndia } = useIndiaRegion();
  const killSwitches = useGlobalStore((state) => state.featureKillSwitches);
  const featureFlags = useGlobalStore((state) => state.featureFlags);
  const isFeatureEnabled = useGlobalStore((state) => state.isFeatureEnabled);

  const signOut = useAuthStore((state) => state.signOut);

  const [hoverExpanded, setHoverExpanded] = useState(false);
  /** Forced collapse below lg — does not write into persisted preference. */
  const [viewportForcedCollapse, setViewportForcedCollapse] = useState(false);

  const collapsed = onNavClick
    ? false
    : viewportForcedCollapse || sidebarCollapsed;
  const visuallyCollapsed = collapsed && !hoverExpanded;
  const initial = getProfileInitial(profile);
  const planLabel = getPlanLabel(profile);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      // Below lg: force visual collapse only. Above lg: restore saved preference.
      setViewportForcedCollapse(!event.matches);
    };

    handleChange(mediaQuery);

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  // Mock-test question count badge removed alongside section de-scoping.

  async function handleLogout(): Promise<void> {
    try {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      await signOut();
      assignLoginWithReturnTo({ returnTo });
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
        "transition-all duration-200 relative z-[200]",
        onNavClick ? "w-56" : visuallyCollapsed ? "w-16" : "w-56"
      )}
      onMouseEnter={() => {
        if (!onNavClick && collapsed && window.matchMedia("(min-width: 1024px)").matches) {
          setHoverExpanded(true);
        }
      }}
      onMouseLeave={() => setHoverExpanded(false)}
    >
      <div className="flex min-h-[56px] items-center border-b border-sidebar-border px-3 py-3">
        <NavLink
          to="/app/dashboard"
          onClick={onNavClick}
          title={stealthMode ? STEALTH_BRAND.name : PRODUCT_NAMES.brand}
          aria-label={`${stealthMode ? STEALTH_BRAND.name : PRODUCT_NAMES.brand} — Dashboard`}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-1 transition-colors",
            "hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            visuallyCollapsed && "justify-center px-0",
          )}
        >
          {stealthMode ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
          ) : (
            <BrandLogo
              size="sm"
              showText={!visuallyCollapsed}
              className={cn(visuallyCollapsed && "gap-0")}
            />
          )}
          {stealthMode && !visuallyCollapsed && (
            <span className="truncate text-lg font-bold tracking-tight text-sidebar-foreground">
              {STEALTH_BRAND.name}
            </span>
          )}
        </NavLink>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!visuallyCollapsed && (
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {stealthMode
                  ? STEALTH_SECTION_LABELS[section.label] ?? section.label
                  : section.label}
              </p>
            )}

            {section.items
              .filter((item) => {
                if (!item.featureFlag) return true;
                return (
                  isFeatureEnabled(item.featureFlag) ||
                  Boolean(featureFlags[item.featureFlag]) ||
                  killSwitches[item.featureFlag] !== false
                );
              })
              .map((item) => {
              const isItemActive = isPathActive(location.pathname, item.to);
              const Icon = stealthMode ? item.stealthIcon : item.icon;
              const displayLabel = stealthMode
                ? STEALTH_NAV_LABELS[item.label] ?? item.label
                : item.label;
              const indiaLocked = Boolean(item.indiaOnly && !isIndia);

              if (indiaLocked) {
                return (
                  <div key={item.to}>
                    <div
                      title={`${displayLabel} — available in India`}
                      aria-disabled="true"
                      className={cn(
                        "mx-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium",
                        "text-muted-foreground/70 cursor-not-allowed",
                        visuallyCollapsed && "justify-center"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!visuallyCollapsed && (
                        <>
                          <span className="truncate flex-1">{displayLabel}</span>
                          <span className="shrink-0 rounded-full border border-border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            India
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.exact}
                    title={visuallyCollapsed ? item.label : undefined}
                    data-tour={item.tourId}
                    onClick={onNavClick}
                    onMouseEnter={() => {
                      ROUTE_PREFETCH[item.to]?.();
                    }}
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
                            : "border border-primary/20 bg-primary/15 text-primary dark:text-primary/90"
                          : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                        visuallyCollapsed && "justify-center"
                      );
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />

                    {!visuallyCollapsed && (
                      <span className="truncate flex-1">
                        {displayLabel}
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
          to="/app/guide/practice-coach"
          icon={BookMarked}
          label="Guide"
          collapsed={visuallyCollapsed}
          stealth={stealthMode}
          onClick={onNavClick}
        />

        <SidebarLink
          to="/app/notifications"
          icon={stealthMode ? Inbox : Bell}
          label={stealthMode ? "Inbox" : "Notifications"}
          collapsed={visuallyCollapsed}
          stealth={stealthMode}
          onClick={onNavClick}
        />

        <SidebarLink
          to="/app/settings"
          icon={stealthMode ? Wrench : Settings}
          label={stealthMode ? "Preferences" : "Settings"}
          collapsed={visuallyCollapsed}
          stealth={stealthMode}
          onClick={onNavClick}
        />

        {isStaff && (
          <SidebarLink
            to={isAdmin ? "/app/admin" : "/app/admin/community"}
            icon={ShieldAlert}
            label={isAdmin ? "Admin Panel" : "Moderation"}
            collapsed={visuallyCollapsed}
            stealth={stealthMode}
            onClick={onNavClick}
          />
        )}

        <div
          className={cn(
            "mx-1 flex items-center gap-2 rounded-xl px-3 py-2 transition-all hover:bg-accent/10",
            visuallyCollapsed && "justify-center"
          )}
        >
          <NavLink
            to="/app/settings/profile"
            onClick={onNavClick}
            title={visuallyCollapsed ? "Profile" : undefined}
            className="shrink-0"
          >
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white",
                stealthMode ? "bg-blue-600" : "bg-primary"
              )}
            >
              {initial}
            </div>
          </NavLink>

          {!visuallyCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-sidebar-foreground">
                {profile?.full_name ?? "User"}
              </p>

              <p className="text-[10px] text-muted-foreground">
                {planLabel}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleLogout()}
            title="Log out"
            aria-label="Log out"
            className={cn(
              "p-1.5 rounded-lg text-muted-foreground transition-colors hover:text-red-400 hover:bg-red-500/10",
              visuallyCollapsed && "mx-auto",
            )}
          >
            <LogOut className="h-4 w-4" />
          </button>
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
              : "border border-primary/20 bg-primary/15 text-primary dark:text-primary/90"
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
