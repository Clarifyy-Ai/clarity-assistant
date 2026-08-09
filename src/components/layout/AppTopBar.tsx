import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Bell, Zap, AlertTriangle, Shield, ShieldOff, LogOut, Settings, User, Search, X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useUIStore } from "@/store/uiStore";
import { useNotifications } from "@/hooks/useNotifications";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CommandPalette } from "@/components/common/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/marketing";
import { ProductModePill } from "@/components/layout/ProductModePill";
import { buildLoginUrl } from "@/lib/auth/safeReturnTo";

const CMDK_TIP_KEY = "clarify:cmdk-tip-dismissed";

export function AppTopBar() {
  const { profile, signOut, refreshCredits } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const notifStore  = useNotificationStore();
  const uiStore     = useUIStore();
  useNotifications();
  const stealthMode = uiStore.stealth_mode;
  const [showCmdTip, setShowCmdTip] = useState(false);

  useEffect(() => {
    const onFocus = () => void refreshCredits();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshCredits]);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CMDK_TIP_KEY)) setShowCmdTip(true);
    } catch {
      /* ignore */
    }
  }, []);

  function dismissCmdTip() {
    try {
      localStorage.setItem(CMDK_TIP_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowCmdTip(false);
  }

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

  async function handleSignOut() {
    try {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      await signOut();
      navigate(buildLoginUrl({ returnTo }), { replace: true });
    } catch (error) {
      console.error("[AppTopBar] Sign out failed:", error);
    }
  }

  return (
    <header
      style={dragStyle}
      className="sticky top-0 z-[200] h-14 w-full flex-shrink-0 bg-background/95 backdrop-blur border-b border-border flex items-center justify-between px-2 sm:px-4"
    >

      <div style={noDragStyle} className="flex items-center gap-1.5 min-w-0 shrink-0 md:hidden">
        <Link
          to="/app/dashboard"
          className="flex items-center gap-1.5 pr-1"
          aria-label="Clarify AI home"
        >
          <BrandLogo size="sm" />
        </Link>
        <ProductModePill />
      </div>

      <div style={noDragStyle} className="hidden md:flex items-center gap-2 min-w-0 flex-1">
        <Link
          to="/app/dashboard"
          className="flex items-center gap-1.5 pr-1 shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Clarify AI dashboard"
        >
          <BrandLogo size="sm" showText={false} />
        </Link>
        <ProductModePill />
      </div>

      <div style={noDragStyle} className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 h-9">

        <button
          type="button"
          style={noDragStyle}
          data-tour="topbar-credits"
          onClick={() => uiStore.openUpgradeModal("pro")}
          aria-label={`${credits} credit${credits === 1 ? "" : "s"}${isEmpty ? " — upgrade" : ""}`}
          className={cn(
            "flex items-center gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3 rounded-xl border text-[10px] sm:text-xs font-semibold transition-all",
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
          aria-label={stealthMode ? "Disable discrete UI" : "Enable discrete UI"}
          title={
            stealthMode
              ? "Disable discrete UI labels (restores Clarify AI naming)"
              : "Use neutral nav labels for private practice (does not hide the app from screen sharing)"
          }
          className={cn(
            "hidden md:flex items-center gap-1 sm:gap-1.5 h-9 px-2 sm:px-2.5 rounded-xl border text-[10px] sm:text-xs font-medium transition-all",
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
          <span className="hidden sm:inline">Discrete UI</span>
        </button>

        <div style={noDragStyle} className="hidden md:flex items-center h-9">
          <ThemeToggle />
        </div>

        <div className="relative shrink-0 flex items-center h-9" style={noDragStyle}>
          <button
            type="button"
            onClick={() => {
              dismissCmdTip();
              uiStore.setCommandPaletteOpen(true);
            }}
            aria-label="Search (Ctrl+K)"
            title="Search (Ctrl+K)"
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-all"
          >
            <Search className="w-4 h-4" />
          </button>
          {showCmdTip && (
            <div
              role="status"
              className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-border bg-popover p-3 shadow-lg text-xs text-foreground"
            >
              <div className="flex items-start gap-2">
                <p className="flex-1 leading-relaxed">
                  Press{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono text-[10px]">
                    {typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
                      ? "⌘"
                      : "Ctrl"}
                    +K
                  </kbd>{" "}
                  to jump anywhere fast.
                </p>
                <button
                  type="button"
                  onClick={dismissCmdTip}
                  className="shrink-0 p-0.5 rounded hover:bg-secondary text-muted-foreground"
                  aria-label="Dismiss tip"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <Link
          to="/app/notifications"
          style={noDragStyle}
          aria-label={notifStore.unread_count > 0 ? `${notifStore.unread_count} unread notifications` : "Notifications"}
          className="relative shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-all"
        >
          <Bell className="w-4 h-4" />
          {notifStore.unread_count > 0 && (
            <span className={cn(
              "absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-0.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-background",
              stealthMode ? "bg-blue-500" : "bg-primary"
            )}>
              {notifStore.unread_count > 9 ? "9+" : notifStore.unread_count}
            </span>
          )}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              style={noDragStyle}
              aria-label="Account menu"
              className={cn(
                "w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold text-white hover:ring-2 transition-all flex-shrink-0",
                stealthMode
                  ? "bg-blue-600 hover:ring-blue-500"
                  : "bg-primary hover:ring-primary/50"
              )}
            >
              {initial}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to="/app/settings/profile" className="flex items-center gap-2 cursor-pointer">
                <User className="w-4 h-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/settings" className="flex items-center gap-2 cursor-pointer">
                <Settings className="w-4 h-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void handleSignOut()}
              className="text-red-500 focus:text-red-500 cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CommandPalette />
    </header>
  );
}
