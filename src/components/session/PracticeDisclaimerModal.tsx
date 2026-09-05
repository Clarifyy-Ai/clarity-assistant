import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  localStorageGetWithLegacy,
  localStorageSetBrand,
} from "@/lib/constants/brandStorage";

const STORAGE_KEY = "career-pilot-practice-disclaimer-v1";
const LEGACY_KEYS = ["Clarify AI-practice-disclaimer-v1"] as const;

function hasAcceptedDisclaimer(userId: string | undefined): boolean {
  if (!userId) return true;
  try {
    const raw = localStorageGetWithLegacy(STORAGE_KEY, LEGACY_KEYS);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(map[userId]);
  } catch {
    return false;
  }
}

function markDisclaimerAccepted(userId: string): void {
  try {
    const raw = localStorageGetWithLegacy(STORAGE_KEY, LEGACY_KEYS);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[userId] = true;
    localStorageSetBrand(STORAGE_KEY, JSON.stringify(map), LEGACY_KEYS);
  } catch {
    /* best-effort */
  }
}

export function PracticeDisclaimerModal({
  userId,
}: {
  userId: string | undefined;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId || hasAcceptedDisclaimer(userId)) return;
    const timer = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(timer);
  }, [userId]);

  const accept = useCallback(() => {
    if (userId) markDisclaimerAccepted(userId);
    setOpen(false);
  }, [userId]);

  if (!open || !userId) return null;

  return (
    <Modal open={open} onClose={accept} title="Practice only" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-600/30 bg-amber-500/10 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-foreground leading-relaxed">
            <strong>Practice only.</strong> Practice Coach is designed for interview rehearsal with an
            AI coach. Do not use during real interviews — covert AI assistance violates most employer
            and assessment policies.
          </p>
        </div>
        <Button type="button" fullWidth onClick={accept}>
          I understand — continue setup
        </Button>
      </div>
    </Modal>
  );
}
