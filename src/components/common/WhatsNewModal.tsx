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
import { Button } from "@/components/ui/button";
import { APP_VERSION, APP_LAST_UPDATED } from "@/lib/constants/version";

const STORAGE_KEY = "clarify:whats-new-dismissed";

const RELEASE_NOTES = [
  "Practice Coach opens in the overlay — setup and summary stay on /app/live.",
  "Start Practice (same setup) for one-click returning sessions.",
  "2-step onboarding gets you into your first session faster.",
  "Mobile: hints-only overlay, swipe-to-delete lists, and Add to Home Screen.",
];

export function useWhatsNewPrompt(): {
  open: boolean;
  dismiss: () => void;
} {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed !== APP_VERSION) {
        setOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

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
