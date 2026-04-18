import { Link } from "react-router-dom";
import { Bell, Zap, AlertTriangle, Shield, ShieldOff, Menu, X } from "lucide-react";
import { useAuthStore } from "@/store/userStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useUIStore } from "@/store/uiStore";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/utils";

export function AppTopBar() {
  const { profile } = useAuthStore();
  const notifStore  = useNotificationStore();
  const uiStore     = useUIStore();
  const stealthMode = uiStore.stealth_mode;
  const mobileNavOpen = uiStore.mobile_nav_open;

  const credits = profile?.credits ?? 0;
  const isLow   = credits <= 2;
  const isEmpty = credits === 0;

  const initial = (
    profile?.full_name?.trim()?.[0] ??
    profile?.email?.trim()?.[0] ??
    "U"
  ).toUpperCase();

  // Electron drag region: the header bar itself is draggable so the user can
  // reposition the window, but every interactive child below opts out via
  // `WebkitAppRegion: "no-drag"` so clicks reach the button handlers.
  // CSS-in-JS is used because Tailwind has no first-class utility for the
  // non-standard `-webkit-app-region` property.
  const dragStyle = { WebkitAppRegion: "drag" } as React.CSSProperties;
  const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  return (
    <header
      style={dragStyle}
      className="sticky top-0 z-40 h-14 w-full flex-shrink-0 bg-background/95 backdrop-blur border-b border-border flex items-center justify-between px-2 sm:px-4"
    >

      {/* Mobile hamburger — only visible on small screens */}
      <button
        type="button"
        style={noDragStyle}
        onClick={() => uiStore.setMobileNavOpen(!mobileNavOpen)}
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all mr-1"
        aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
      >
        {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <div
        className="flex items-center gap-2 min-w-0 flex-1"
        id="topbar-breadcrumb"
      />

      <div style={noDragStyle} className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">

        <button
          type="button"
          style={noDragStyle}
          onClick={() => uiStore.openUpgradeModal("pro")}
          className={cn(
            "flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl border text-[10px] sm:text-xs font-semibold transition-all",
            isEmpty
              ? "bg-red-500/10 border-red-500/30 text-red-400 animate-pulse"
              : isLow
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
              : "bg-secondary/60 border-border text-muted-foreground hover:bg-secondary"
          )}
        >
          {(isEmpty || isLow) ? (
            <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          ) : (
            <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          )}
          <span>{credits}</span>
          <span className="hidden sm:inline">{credits === 1 ? "credit" : "credits"}</span>
          {isEmpty && <span className="ml-1 hidden sm:inline">· Upgrade</span>}
        </button>

        <button
          type="button"
          style={noDragStyle}
          onClick={toggleAppStealthMode}
          title={stealthMode ? "Disable stealth mode" : "Enable stealth mode"}
          className={cn(
            "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border text-[10px] sm:text-xs font-medium transition-all",
            stealthMode
              ? "bg-blue-500/10 border-blue-500/30 text-blue-500 dark:text-blue-400"
              : "bg-secondary/60 border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          {stealthMode ? (
            <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          ) : (
            <ShieldOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          )}
          <span className="hidden sm:inline">Stealth</span>
        </button>

        <div style={noDragStyle}>
          <ThemeToggle />
        </div>

        <Link
          to="/app/notifications"
          style={noDragStyle}
          className="relative w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-all"
        >
          <Bell className="w-4 h-4" />
          {notifStore.unread_count > 0 && (
            <span className={cn(
              "absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-2 h-2 rounded-full ring-2 ring-background",
              stealthMode ? "bg-blue-500" : "bg-violet-500"
            )} />
          )}
        </Link>

        <Link
          to="/app/profile"
          style={noDragStyle}
          className={cn(
            "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold text-white hover:ring-2 transition-all flex-shrink-0",
            stealthMode
              ? "bg-blue-600 hover:ring-blue-500"
              : "bg-violet-700 hover:ring-violet-500"
          )}
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}
