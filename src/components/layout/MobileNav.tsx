import { useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Mic,
  ClipboardList,
  FlaskConical,
  Brain,
  Menu,
  BarChart3,
  FileText,
  Settings,
  MessageSquare,
  Phone,
  Building2,
  BookOpen,
  CalendarDays,
  Gift,
  LogOut,
  Gauge,
  Sunrise,
  Bell,
  BookMarked,
  UserRound,
  Shield,
  type LucideIcon,
} from "lucide-react";

import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { notifyOverlayVisibilityOnMobile } from "@/lib/overlay/overlayVisibilityNotice";
import { assignLoginWithReturnTo } from "@/lib/auth/safeReturnTo";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useIndiaRegion } from "@/hooks/useIndiaRegion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type MobileTab = {
  to: string;
  icon: LucideIcon;
  label: string;
  exact?: boolean;
};

type MoreLink = {
  to: string;
  icon: LucideIcon;
  label: string;
  adminOnly?: boolean;
};

const TABS: MobileTab[] = [
  { to: "/app/dashboard", icon: LayoutDashboard, label: "Home", exact: true },
  { to: "/app/live", icon: Mic, label: PRODUCT_NAMES.practiceCoach },
  { to: "/app/mock", icon: ClipboardList, label: PRODUCT_NAMES.mockInterview },
  { to: "/app/prep", icon: FlaskConical, label: PRODUCT_NAMES.prepLab },
  {
    to: "/app/mock-test",
    icon: Brain,
    label: "Gov Exams",
  },
];

const MORE_LINKS: MoreLink[] = [
  { to: "/app/sessions", icon: Phone, label: PRODUCT_NAMES.sessionHistory },
  { to: "/app/documents", icon: FileText, label: PRODUCT_NAMES.documents },
  { to: "/app/answers", icon: BookOpen, label: PRODUCT_NAMES.answerBank },
  { to: "/app/analytics", icon: BarChart3, label: PRODUCT_NAMES.analytics },
  { to: "/app/usage", icon: Gauge, label: PRODUCT_NAMES.creditsUsage },
  { to: "/app/debriefs", icon: MessageSquare, label: PRODUCT_NAMES.debrief },
  { to: "/app/plan", icon: ClipboardList, label: "Practice plan" },
  { to: "/app/assessments", icon: Brain, label: "Assessments" },
  { to: "/app/learn", icon: BookOpen, label: "Learning Hub" },
  { to: "/app/question-bank", icon: FileText, label: "Question bank" },
  { to: "/app/community", icon: MessageSquare, label: "Q&A" },
  { to: "/app/coding", icon: FlaskConical, label: "Coding lab" },
  { to: "/app/library", icon: FileText, label: "Document library" },
  { to: "/app/practice-workspace", icon: ClipboardList, label: "Practice workspace" },
  { to: "/app/interview-day", icon: Sunrise, label: PRODUCT_NAMES.interviewDay },
  { to: "/app/interviews", icon: CalendarDays, label: PRODUCT_NAMES.interviews },
  { to: "/app/companies", icon: Building2, label: PRODUCT_NAMES.companyResearch },
  { to: "/app/notifications", icon: Bell, label: "Notifications" },
  { to: "/app/referrals", icon: Gift, label: PRODUCT_NAMES.referrals },
  { to: "/app/guide/practice-coach", icon: BookMarked, label: "Guide" },
  { to: "/app/settings/profile", icon: UserRound, label: "Profile" },
  { to: "/app/settings", icon: Settings, label: "Settings" },
  { to: "/app/admin", icon: Shield, label: "Admin", adminOnly: true },
];

function isRouteActive(pathname: string, tab: MobileTab): boolean {
  if (tab.exact) return pathname === tab.to;
  return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
}

export function MobileNav(): JSX.Element {
  const location = useLocation();
  const signOut = useAuthStore((s) => s.signOut);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { isIndia } = useIndiaRegion();
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleMore = MORE_LINKS.filter((l) => !l.adminOnly || isAdmin);
  const moreActive = visibleMore.some(
    (l) => location.pathname === l.to || location.pathname.startsWith(`${l.to}/`),
  );

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-16 bg-background/95 backdrop-blur border-t border-border z-[200] flex items-center md:hidden"
      aria-label="Mobile navigation"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = isRouteActive(location.pathname, tab);
        const indiaLocked = tab.to === "/app/mock-test" && !isIndia;

        if (indiaLocked) {
          return (
            <span
              key={tab.to}
              aria-label={`${tab.label} (India)`}
              title="Available in India"
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground/70"
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span>India</span>
            </span>
          );
        }

        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.exact}
            onClick={() => {
              if (tab.to === "/app/live") notifyOverlayVisibilityOnMobile();
            }}
            aria-label={tab.label}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("w-5 h-5 transition-transform", isActive && "scale-105")} aria-hidden="true" />
            <span>{tab.label}</span>
          </NavLink>
        );
      })}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="More navigation"
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-all",
              moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
            <span>More</span>
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl p-0 flex flex-col max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-bottom)))]"
        >
          <SheetHeader className="px-6 pt-6 pb-2 shrink-0">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6">
            <div className="grid grid-cols-2 gap-2 py-2">
              {visibleMore.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-secondary/60 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-primary" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="shrink-0 px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-border bg-background">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                const returnTo = `${location.pathname}${location.search}${location.hash}`;
                void signOut().then(() => assignLoginWithReturnTo({ returnTo }));
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

export default MobileNav;
