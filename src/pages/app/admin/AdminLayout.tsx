import { useState, useEffect, useMemo } from "react";
import { NavLink, Outlet, Link, useLocation, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { logger } from "@/lib/logger";
import {
  LayoutDashboard, Users, BarChart2,
  Flag, Shield, ChevronRight, DollarSign, Cpu, Bot,
  MessageSquare, FileText, Database, ScrollText, LifeBuoy,
  ExternalLink, Upload, Menu, Tag, Settings2,
  Link2, BookOpen, ListChecks, FileStack, Languages, FileUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppLoadingFallback } from "@/components/layout/AppLoadingFallback";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type AdminNavItem = { to: string; icon: React.ElementType; label: string; staff?: "admin" | "staff" };
type AdminNavSection = { label: string; items: AdminNavItem[] };

const MODERATOR_PATHS = [
  "/app/admin/community",
  "/app/admin/questions",
  "/app/admin/gov/question-review",
];

function isModeratorAllowedPath(pathname: string): boolean {
  return MODERATOR_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    label: "Users & Support",
    items: [
      { to: "/app/admin/users",     icon: Users,         label: "Users"     },
      { to: "/app/admin/live-chat", icon: MessageSquare, label: "Support messages" },
      { to: "/app/admin/support",   icon: LifeBuoy,      label: "Support"   },
      { to: "/app/admin/audit-log", icon: ScrollText,    label: "Audit Log" },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/app/admin/questions",      icon: FileText,       label: "Questions", staff: "staff" },
      { to: "/app/admin/bulk-upload",    icon: Upload,         label: "Bulk Upload"   },
      { to: "/app/admin/seed-questions", icon: Database,       label: "Seed / Import" },
      { to: "/app/admin/community",      icon: MessageSquare,  label: "Q&A (Preview)", staff: "staff" },
      { to: "/app/admin/learning",       icon: BookOpen,       label: "Learning Hub"  },
      { to: "/app/admin/blog",           icon: FileText,       label: "Blog"          },
      { to: "/app/admin/help-articles",  icon: BookOpen,       label: "Help Articles" },
    ],
  },
  {
    label: "Gov Exams",
    items: [
      { to: "/app/admin/gov/sources",          icon: Link2,      label: "Sources"       },
      { to: "/app/admin/gov/ingest",           icon: FileUp,     label: "PDF Ingest"    },
      { to: "/app/admin/gov/exams",            icon: BookOpen,   label: "Exam Registry" },
      { to: "/app/admin/gov/question-review",  icon: ListChecks, label: "Q Review", staff: "staff" },
      { to: "/app/admin/gov/paper-review",     icon: FileStack,  label: "Paper Review"  },
      { to: "/app/admin/gov/translations",     icon: Languages,  label: "Translations"  },
    ],
  },
  {
    label: "Billing",
    items: [
      { to: "/app/admin/revenue",          icon: DollarSign, label: "Revenue" },
      { to: "/app/admin/promo-codes",      icon: Tag,        label: "Offers"  },
      { to: "/app/admin/billing-settings", icon: Settings2,  label: "Billing" },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/app/admin",                 icon: LayoutDashboard, label: "Dashboard"       },
      { to: "/app/admin/analytics",       icon: BarChart2,       label: "Analytics"       },
      { to: "/app/admin/feature-flags",   icon: Flag,            label: "Feature Flags"   },
      { to: "/app/admin/diagnostics",     icon: Shield,          label: "Diagnostics"     },
      { to: "/app/admin/model-costs",     icon: Cpu,             label: "Model Costs"     },
      { to: "/app/admin/ai-hub",          icon: Bot,             label: "AI Hub"          },
    ],
  },
];

function AdminNavLinks({
  sections,
  onNavigate,
}: {
  sections: AdminNavSection[];
  onNavigate?: () => void;
}) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.label} className="pt-2 first:pt-0">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {section.label}
          </p>
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app/admin"}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-150",
                  isActive
                    ? "bg-red-500/10 text-red-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/5",
                )
              }
            >
              <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </>
  );
}

export default function AdminLayout() {
  const { isAdmin, isModerator, isAdminResolved, isProfileLoaded } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isStaff = isAdmin || isModerator;

  const navSections = useMemo(() => {
    if (isAdmin) return ADMIN_NAV_SECTIONS;
    return ADMIN_NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.staff === "staff"),
      }))
      .filter((section) => section.items.length > 0);
  }, [isAdmin]);

  useEffect(() => {
    if (isProfileLoaded && isAdminResolved && !isStaff) {
      logger.warn("route.rbac.access_denied", {
        route: window.location.pathname,
        reason: "User lacks staff role",
      });
    }
  }, [isProfileLoaded, isAdminResolved, isStaff]);

  // Wait for a definitive user_roles result — abort/timeout must not redirect.
  if (!isProfileLoaded || !isAdminResolved) {
    return <AppLoadingFallback />;
  }

  if (!isStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
          <h1 className="text-lg font-semibold" tabIndex={-1} autoFocus>
            Access Denied
          </h1>
          <p className="text-sm text-muted-foreground">
            You are not authorized to access admin tools.
          </p>
          <Link
            to="/app/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isModerator && !isAdmin && !isModeratorAllowedPath(location.pathname)) {
    return <Navigate to="/app/admin/community" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      {/* Mobile header */}
      <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open admin navigation"
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors duration-150"
            >
              <Menu className="w-5 h-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="p-4 border-b border-border text-left">
              <SheetTitle className="flex items-center gap-2 text-sm">
                <Shield className="w-5 h-5 text-red-400" aria-hidden="true" />
                {isAdmin ? "Admin" : "Moderation"}
              </SheetTitle>
            </SheetHeader>
            <nav className="p-3 space-y-3" aria-label="Admin navigation">
              <AdminNavLinks sections={navSections} onNavigate={() => setMobileOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-red-400" aria-hidden="true" />
          <span className="text-sm font-semibold">{isAdmin ? "Admin" : "Moderation"}</span>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 shrink-0 border-r border-border flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400" aria-hidden="true" />
            <span className="text-sm font-bold text-foreground">{isAdmin ? "Admin" : "Moderation"}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {isAdmin ? "Clarify AI control panel" : "Content moderation"}
          </p>
        </div>

        <nav className="flex-1 p-3 space-y-3" aria-label="Admin navigation">
          <AdminNavLinks sections={navSections} />
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <NavLink
            to="/app/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            <ChevronRight className="w-3 h-3 rotate-180" aria-hidden="true" />
            Back to app
          </NavLink>
          <a
            href="/help"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
            Help docs
          </a>
        </div>
      </aside>

      <main id="main-content" className="flex-1 overflow-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
