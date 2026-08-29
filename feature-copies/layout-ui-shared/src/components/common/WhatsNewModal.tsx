import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { APP_VERSION, APP_LAST_UPDATED } from "@/lib/constants/version";
import { useAuthStore } from "@/store/authStore";
import { hasCompletedAppWalkthrough } from "@/lib/onboarding/appWalkthroughStorage";

const STORAGE_KEY = "clarify:whats-new-dismissed";

const RELEASE_NOTES = [
  "Practice Coach opens in the overlay — setup and summary stay on /app/live.",
  "Start Practice (same setup) for one-click returning sessions.",
  "Mid-session audio issues show a clear Reconnect banner in the overlay.",
  "Mobile: hints-only overlay, swipe-to-delete lists, and Add to Home Screen.",
  "Mock sessions resume from the URL after refresh; Desktop first-run tips for Electron.",
  "Dashboard focuses on Start Practice; Prep Lab shows credit costs before AI spend.",
];

export function useWhatsNewPrompt(): {
  open: boolean;
  dismiss: () => void;
} {
  const [open, setOpen] = useState(false);
  const userId = useAuthStore((s) => s.user?.id);
  const onboardingCompleted = useAuthStore((s) => s.profile?.onboarding_completed);

  useEffect(() => {
    if (!userId || !onboardingCompleted) return;
    // Don't stack WhatsNew on top of the first-run walkthrough
    if (!hasCompletedAppWalkthrough(userId)) return;

    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed !== APP_VERSION) {
        setOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, [userId, onboardingCompleted]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, APP_VERSION);
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  return { open, dismiss };
}

export function WhatsNewModal({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            What&apos;s new in v{APP_VERSION}
          </DialogTitle>
          <DialogDescription>
            Updated {APP_LAST_UPDATED}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
          {RELEASE_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="primary" onClick={onDismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
