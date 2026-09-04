import { useCallback, useEffect, useState } from "react";
import {
  FIRST_PRACTICE_EVENT,
  hasCompletedFirstPractice,
} from "@/lib/session/lastPracticeSetup";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const canInstallListeners = new Set<(ready: boolean) => void>();

/**
 * Capture beforeinstallprompt as early as this module loads so Chrome never
 * warns that preventDefault was missing (useEffect listeners attach too late).
 */
function captureBeforeInstallPrompt(event: Event) {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  for (const listener of canInstallListeners) listener(true);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", captureBeforeInstallPrompt);
}

/** Test/helper: whether a deferred install prompt is currently held. */
export function hasDeferredInstallPrompt(): boolean {
  return deferredPrompt != null;
}

export function usePwaInstallPrompt() {
  const [canInstall, setCanInstall] = useState(Boolean(deferredPrompt));
  const [readyAfterPractice, setReadyAfterPractice] = useState(hasCompletedFirstPractice);

  useEffect(() => {
    const onCanInstall = (ready: boolean) => setCanInstall(ready);
    canInstallListeners.add(onCanInstall);
    // Sync in case the module-level listener already captured the event.
    setCanInstall(Boolean(deferredPrompt));

    const onFirstPractice = () => setReadyAfterPractice(true);
    window.addEventListener(FIRST_PRACTICE_EVENT, onFirstPractice);

    return () => {
      canInstallListeners.delete(onCanInstall);
      window.removeEventListener(FIRST_PRACTICE_EVENT, onFirstPractice);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanInstall(false);
    for (const listener of canInstallListeners) listener(false);
    return outcome === "accepted";
  }, []);

  return { canInstall, promptInstall, readyAfterPractice };
}
