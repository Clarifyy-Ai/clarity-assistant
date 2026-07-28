import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Bell, Zap, AlertTriangle, Shield, ShieldOff, Menu, X, LogOut, Settings, User, Search } from "lucide-react";
import { useAuthStore } from "@/store/userStore";
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

export function AppTopBar() {
  const { profile, signOut, refreshCredits } = useAuthStore();
  const navigate = useNavigate();
  const notifStore  = useNotificationStore();
  const uiStore     = useUIStore();
  useNotifications();
  const stealthMode = uiStore.stealth_mode;
  const mobileNavOpen = uiStore.mobile_nav_open;

  useEffect(() => {
    const onFocus = () => void refreshCredits();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshCredits]);

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
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("[AppTopBar] Sign out failed:", error);
    }
  }

  return (
    <header
      style={dragStyle}
      className="sticky top-0 z-[200] h-14 w-full flex-shrink-0 bg-background/95 backdrop-blur border-b border-border flex items-center justify-between px-2 sm:px-4"
    >

      <div style={noDragStyle} className="flex items-center gap-1 min-w-0 shrink-0 md:hidden">
        <button
          type="button"
          style={noDragStyle}
          onClick={() => uiStore.setMobileNavOpen(!mobileNavOpen)}
          className="flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
        >
          {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Link
          to="/app"
          className="flex items-center gap-1.5 pr-1"
          aria-label="Clarify AI home"
        >
          <BrandLogo size="sm" />
        </Link>
      </div>

      <div className="flex items-center gap-2 min-w-0 flex-1" />

      <div style={noDragStyle} className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">

        <button
          type="button"
          style={noDragStyle}
          data-tour="topbar-credits"
          onClick={() => uiStore.openUpgradeModal("pro")}
          aria-label={`${credits} credit${credits === 1 ? "" : "s"}${isEmpty ? " — upgrade" : ""}`}
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
          aria-label={stealthMode ? "Disable discrete UI" : "Enable discrete UI"}
          title={
            stealthMode
              ? "Disable discrete UI labels (restores Clarify AI naming)"
              : "Use neutral nav labels for private practice (does not hide the app from screen sharing)"
          }
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
          <span className="hidden sm:inline">Discrete UI</span>
        </button>

        <div style={noDragStyle}>
          <ThemeToggle />
        </div>

        <button
          type="button"
          style={noDragStyle}
          onClick={() => uiStore.setCommandPaletteOpen(true)}
          aria-label="Search (Ctrl+K)"
          title="Search (Ctrl+K)"
          className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-all"
        >
          <Search className="w-4 h-4" />
        </button>

        <Link
          to="/app/notifications"
          style={noDragStyle}
          aria-label={notifStore.unread_count > 0 ? `${notifStore.unread_count} unread notifications` : "Notifications"}
          className="relative w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-all"
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
                "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold text-white hover:ring-2 transition-all flex-shrink-0",
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
              <Link to="/app/profile" className="flex items-center gap-2 cursor-pointer">
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
