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

export function usePwaInstallPrompt() {
  const [canInstall, setCanInstall] = useState(Boolean(deferredPrompt));
  const [readyAfterPractice, setReadyAfterPractice] = useState(hasCompletedFirstPractice);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      deferredPrompt = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    const onFirstPractice = () => setReadyAfterPractice(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener(FIRST_PRACTICE_EVENT, onFirstPractice);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener(FIRST_PRACTICE_EVENT, onFirstPractice);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanInstall(false);
    return outcome === "accepted";
  }, []);

  return { canInstall, promptInstall, readyAfterPractice };
}
