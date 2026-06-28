import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Download,
  Monitor,
  Mic,
  Keyboard,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import {
  getDesktopDownloadHref,
  isDesktopDownloadExternal,
  DESKTOP_INSTALL_GUIDE_PATH,
} from "@/lib/constants/desktopDownload";
import {
  dismissInstallPrompt,
  hasDismissedInstallPrompt,
  isInstallPromptSnoozed,
  snoozeInstallPrompt,
} from "@/lib/onboarding/installPromptStorage";
import { hasCompletedAppWalkthrough } from "@/lib/onboarding/appWalkthroughStorage";
import { detectOs, osInstallLabel } from "@/lib/platform/detectOs";
import { toast } from "sonner";

const IS_ELECTRON = Boolean(
  (window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron,
);

const INSTALL_STEPS = [
  {
    icon: Download,
    title: "Download the desktop app",
    detail: "Get the signed installer for your OS (.exe, .dmg, or AppImage).",
  },
  {
    icon: Mic,
    title: "Allow microphone access",
    detail: "Required for live transcription during Practice Coach sessions.",
  },
  {
    icon: Keyboard,
    title: "Use global hotkeys",
    detail: "Ctrl+Shift+H toggles the overlay; Ctrl+Enter generates AI answers.",
  },
];

export function InstallPromptModal(): JSX.Element | null {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const onboardingCompleted = useAuthStore((s) => s.profile?.onboarding_completed);
  const activeTourStep = useUIStore((s) => s.active_tour_step);

  const { canInstall, promptInstall } = usePwaInstallPrompt();
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  const os = detectOs();
  const osLabel = osInstallLabel(os);
  const hasExternalDownload = isDesktopDownloadExternal();

  const close = useCallback(() => setOpen(false), []);

  const dismissPermanent = useCallback(() => {
    if (userId) dismissInstallPrompt(userId);
    close();
  }, [userId, close]);

  const snooze = useCallback(() => {
    if (userId) snoozeInstallPrompt(userId);
    close();
  }, [userId, close]);

  useEffect(() => {
    if (IS_ELECTRON) return;
    if (!userId || !isProfileLoaded || !onboardingCompleted) return;
    if (hasDismissedInstallPrompt(userId)) return;
    if (isInstallPromptSnoozed(userId)) return;
    if (activeTourStep) return;
    if (!hasCompletedAppWalkthrough(userId)) return;

    const timer = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(timer);
  }, [userId, isProfileLoaded, onboardingCompleted, activeTourStep]);

  async function handleInstall() {
    setInstalling(true);
    try {
      if (canInstall) {
        const accepted = await promptInstall();
        if (accepted) {
          toast.success(`${PRODUCT_NAMES.brand} installed — open it from your home screen or apps menu.`);
          dismissPermanent();
          return;
        }
        return;
      }

      if (hasExternalDownload) {
        window.open(getDesktopDownloadHref(), "_blank", "noopener,noreferrer");
        dismissPermanent();
        return;
      }

      dismissPermanent();
      navigate(DESKTOP_INSTALL_GUIDE_PATH);
    } finally {
      setInstalling(false);
    }
  }

  if (IS_ELECTRON || !userId) return null;

  const installButtonLabel = canInstall
    ? "Install app"
    : hasExternalDownload
      ? `Download for ${osLabel}`
      : "View install guide";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && snooze()}>
      <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-blue-600/10 px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader className="text-left space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">Install {PRODUCT_NAMES.brand}</DialogTitle>
                <DialogDescription className="text-sm mt-0.5">
                  Get the desktop app for the full Practice Coach overlay experience.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex gap-2 rounded-lg border border-indigo-500/25 bg-indigo-500/8 px-3 py-2.5 text-xs text-indigo-100/90 leading-relaxed">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-indigo-300" aria-hidden />
            <p>
              The web app works in your browser, but the <strong className="text-indigo-100">desktop installer</strong>{" "}
              unlocks system-wide hotkeys, a floating overlay, and smoother audio capture.
            </p>
          </div>

          <ol className="space-y-3">
            {INSTALL_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    {index < INSTALL_STEPS.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1 min-h-[12px]" />
                    )}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {!hasExternalDownload && !canInstall && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              On Chrome or Edge you may also use the browser menu → <strong>Install app</strong> after visiting
              this site. Full step-by-step instructions are in the install guide.
            </p>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 flex-col sm:flex-row gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="sm:mr-auto text-muted-foreground"
            onClick={snooze}
          >
            Remind me later
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={dismissPermanent}>
            Don&apos;t show again
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-primary hover:bg-primary/90"
            disabled={installing}
            onClick={() => void handleInstall()}
          >
            {hasExternalDownload && !canInstall ? (
              <ExternalLink className="w-4 h-4 mr-1.5" />
            ) : (
              <Download className="w-4 h-4 mr-1.5" />
            )}
            {installing ? "Opening…" : installButtonLabel}
          </Button>
        </DialogFooter>

        <p className="px-6 pb-4 text-[10px] text-center text-muted-foreground">
          <Link to={DESKTOP_INSTALL_GUIDE_PATH} className="text-primary hover:underline" onClick={close}>
            Full Practice Coach setup guide
          </Link>
        </p>
      </DialogContent>
    </Dialog>
  );
}
