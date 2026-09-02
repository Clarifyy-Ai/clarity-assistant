import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Download,
  Smartphone,
  Mic,
  Home,
  Sparkles,
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
import { useIsMobile } from "@/hooks/use-mobile";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { DESKTOP_INSTALL_GUIDE_PATH } from "@/lib/constants/desktopDownload";
import { DesktopDownloadButton } from "@/components/common/DesktopDownloadButton";
import { AdvisoryBanner } from "@/components/common/AdvisoryBanner";
import {
  dismissInstallPrompt,
  hasDismissedInstallPrompt,
  isInstallPromptSnoozed,
  snoozeInstallPrompt,
} from "@/lib/onboarding/installPromptStorage";
import { toast } from "sonner";
import { isElectronApp } from "@/lib/platform/isElectron";

const IS_ELECTRON = isElectronApp();

const MOBILE_INSTALL_STEPS = [
  {
    icon: Download,
    title: "Add to Home Screen",
    detail: "Tap Share → Add to Home Screen (Safari) or Install app (Chrome) for quick access.",
  },
  {
    icon: Mic,
    title: "Allow microphone",
    detail: "Required for live transcription during Practice Coach on your phone.",
  },
  {
    icon: Home,
    title: "Open from your home screen",
    detail: "Launch like a native app — full-screen, no browser chrome in the way.",
  },
];

const DESKTOP_INSTALL_STEPS = [
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
    icon: Home,
    title: "Use global hotkeys",
    detail: "Ctrl+Shift+H toggles the overlay; Ctrl+Enter generates AI answers.",
  },
];

function isStandalonePwa(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPromptModal(): JSX.Element | null {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const userId = useAuthStore((s) => s.user?.id);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const onboardingCompleted = useAuthStore((s) => s.profile?.onboarding_completed);
  const activeTourStep = useUIStore((s) => s.active_tour_step);

  const { canInstall, promptInstall, readyAfterPractice } = usePwaInstallPrompt();
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

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
    if (IS_ELECTRON || isStandalonePwa()) return;
    if (!userId || !isProfileLoaded || !onboardingCompleted) return;
    if (hasDismissedInstallPrompt(userId)) return;
    if (isInstallPromptSnoozed(userId)) return;
    if (activeTourStep) return;
    if (!readyAfterPractice) return;

    const timer = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(timer);
  }, [userId, isProfileLoaded, onboardingCompleted, activeTourStep, readyAfterPractice]);

  async function handleInstall() {
    setInstalling(true);
    try {
      if (canInstall) {
        const accepted = await promptInstall();
        if (accepted) {
          toast.success(`${PRODUCT_NAMES.brand} installed — open it from your home screen.`);
          dismissPermanent();
          return;
        }
        return;
      }

      snooze();
      navigate(DESKTOP_INSTALL_GUIDE_PATH);
    } finally {
      setInstalling(false);
    }
  }

  if (IS_ELECTRON || !userId || isStandalonePwa()) return null;

  const installSteps = isMobile || canInstall ? MOBILE_INSTALL_STEPS : DESKTOP_INSTALL_STEPS;
  const installButtonLabel = canInstall ? "Add to Home Screen" : isMobile ? "How to install" : "View install guide";
  const HeaderIcon = isMobile || canInstall ? Smartphone : Download;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && snooze()}>
      <DialogContent className="sm:max-w-lg gap-0 p-0 max-h-[min(90dvh,640px)] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-2xl">
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-blue-600/10 px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader className="text-left space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                <HeaderIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  {isMobile || canInstall ? "Install on your phone" : `Install ${PRODUCT_NAMES.brand}`}
                </DialogTitle>
                <DialogDescription className="text-sm mt-0.5">
                  {isMobile || canInstall
                    ? "Add Career Pilot to your home screen for faster Practice Coach access."
                    : "Get the desktop app for the full Practice Coach overlay experience."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          <AdvisoryBanner icon={Sparkles} compact>
            {isMobile || canInstall ? (
              <>
                You completed your first practice session. Install the app for one-tap access to{" "}
                <strong className="font-semibold text-brand-950 dark:text-white">Practice Coach</strong>{" "}
                and Mock Interview on mobile.
              </>
            ) : (
              <>
                The web app supports{" "}
                <strong className="font-semibold text-brand-950 dark:text-white">Mock Interview</strong>{" "}
                and Prep Lab in your browser. The{" "}
                <strong className="font-semibold text-brand-950 dark:text-white">desktop installer</strong>{" "}
                unlocks Practice Coach with system-wide hotkeys.
              </>
            )}
          </AdvisoryBanner>

          <ol className="space-y-3">
            {installSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    {index < installSteps.length - 1 && (
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

          {!canInstall && !isMobile && (
            <DesktopDownloadButton size="sm" showGuideLink={false} />
          )}

          {!canInstall && (isMobile || canInstall) && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground">iPhone:</strong> Safari → Share → Add to Home Screen.{" "}
              <strong className="text-foreground">Android:</strong> Chrome menu → Install app or Add to Home screen.
            </p>
          )}
        </div>

        <DialogFooter className="px-6 pt-4 flex-wrap pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-border bg-muted/20 flex-col sm:flex-row gap-2 sm:gap-2">
          {canInstall ? (
            <Button
              type="button"
              size="sm"
              className={`bg-primary hover:bg-primary/90 min-h-11 ${isMobile ? "order-1" : "sm:order-4"}`}
              disabled={installing}
              onClick={() => void handleInstall()}
              leftIcon={<Download className="w-4 h-4" />}
            >
              {installing ? "Opening…" : installButtonLabel}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`min-h-11 ${isMobile ? "order-1" : "sm:order-4"}`}
              onClick={() => {
                snooze();
                navigate(DESKTOP_INSTALL_GUIDE_PATH);
              }}
            >
              {installButtonLabel}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`min-h-11 ${isMobile ? "order-2" : "sm:order-1"}`}
            onClick={() => {
              snooze();
              navigate("/app/mock");
            }}
          >
            Continue in browser
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`min-h-11 ${isMobile ? "order-3" : "sm:order-2"}`}
            onClick={dismissPermanent}
          >
            Don&apos;t show again
          </Button>
          {isMobile ? (
            <button
              type="button"
              className="order-4 text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline py-1 min-h-11"
              onClick={snooze}
            >
              Remind me later
            </button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sm:order-3 text-muted-foreground min-h-11"
              onClick={snooze}
            >
              Remind me later
            </Button>
          )}
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
