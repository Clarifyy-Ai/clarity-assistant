import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Mic,
  ClipboardList,
  FlaskConical,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// MobileNav
// Bottom tab bar for <768px only.
// Keep this to 5 items max to avoid crowding on small screens.
// ─────────────────────────────────────────────────────────────────────────────

type MobileTab = {
  to: string;
  icon: LucideIcon;
  label: string;
  exact?: boolean;
};

const TABS: MobileTab[] = [
  {
    to: "/app/dashboard",
    icon: LayoutDashboard,
    label: "Home",
    exact: true,
  },
  {
    to: "/app/live",
    icon: Mic,
    label: "Live",
  },
  {
    to: "/app/mock",
    icon: ClipboardList,
    label: "Mock",
  },
  {
    to: "/app/prep",
    icon: FlaskConical,
    label: "Prep",
  },
  {
    to: "/app/usage",
    icon: CreditCard,
    label: "Usage",
  },
];

function isRouteActive(pathname: string, tab: MobileTab): boolean {
  if (tab.exact) {
    return pathname === tab.to;
  }

  return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
}

export function MobileNav(): JSX.Element {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-16 bg-background/95 backdrop-blur border-t border-border z-40 flex items-center md:hidden"
      aria-label="Mobile navigation"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = isRouteActive(location.pathname, tab);

        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.exact}
            aria-label={tab.label}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isActive
                ? "text-violet-500 dark:text-violet-400"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "w-5 h-5 transition-transform",
                isActive && "scale-105"
              )}
              aria-hidden="true"
            />

            <span>{tab.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default MobileNav;
