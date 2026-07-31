import { useEffect, useState } from "react";
import { Monitor, Globe, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isElectronApp } from "@/lib/platform/isElectron";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

const STORAGE_KEY = "clarify:electron-first-run-dismissed";

const DESKTOP_POINTS = [
  {
    icon: Monitor,
    title: "Overlay & Practice Coach",
    detail:
      "The desktop app is built for live sessions — overlay hints, transcription, and global hotkeys during Practice Coach.",
  },
  {
    icon: Globe,
    title: "Full hub in your browser",
    detail:
      "Dashboard, Settings, Billing, Mock Interview, and Prep Lab open in your system browser when you navigate there.",
  },
];

export function ElectronFirstRunModal(): JSX.Element | null {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isElectronApp()) return;

    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const timer = window.setTimeout(() => setOpen(true), 600);
        return () => window.clearTimeout(timer);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!isElectronApp()) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-blue-600/10 px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader className="text-left space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">Welcome to {PRODUCT_NAMES.brand} Desktop</DialogTitle>
                <DialogDescription className="text-sm mt-0.5">
                  A quick note on how the desktop app works.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex gap-2 rounded-lg border border-indigo-500/25 bg-indigo-500/8 px-3 py-2.5 text-xs text-indigo-100/90 leading-relaxed">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-indigo-300" aria-hidden />
            <p>
              Use this app for <strong className="text-indigo-100">Overlay</strong> and{" "}
              <strong className="text-indigo-100">{PRODUCT_NAMES.practiceCoach}</strong> during live calls.
              Your full account hub opens in your browser.
            </p>
          </div>

          <ol className="space-y-3">
            {DESKTOP_POINTS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    {index < DESKTOP_POINTS.length - 1 && (
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
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20">
          <Button type="button" size="sm" className="min-h-11 w-full sm:w-auto" onClick={dismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
