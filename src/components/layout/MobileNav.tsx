import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Mic,
  ClipboardList,
  FlaskConical,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// MobileNav
// Bottom tab bar for <768px only
// ─────────────────────────────────────────────────────────────────

const TABS = [
  { to: "/app/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/app/live",      icon: Mic,             label: "Live" },
  { to: "/app/mock",      icon: ClipboardList,   label: "Mock" },
  { to: "/app/prep",      icon: FlaskConical,    label: "Prep" },
  { to: "/app/analytics", icon: BarChart2,       label: "Stats" },
];

export function MobileNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-background/95 backdrop-blur border-t border-border z-40 flex items-center md:hidden">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          location.pathname === tab.to ||
          location.pathname.startsWith(tab.to + "/");

        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-all",
              isActive ? "text-violet-500 dark:text-violet-400" : "text-muted-foreground"
            )}
          >
            <Icon className="w-5 h-5" />
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
