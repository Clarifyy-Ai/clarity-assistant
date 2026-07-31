// src/components/audio/TabAudioGuideHost.tsx
//
// Global host for the tab-audio guidance modal.
// Listens for confirmTabAudioCapture() requests and presents a blocking
// dialog that explains where the "Share tab audio" checkbox lives in the
// browser share picker. Resolves the request based on user action.
//
// Mounted once near the root of <App />.

import { useEffect, useState } from "react";
import { Volume2, MonitorUp, CheckSquare } from "lucide-react";
import { subscribeTabAudioGuide } from "@/lib/audio/tabAudioGuide";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function TabAudioGuideHost() {
  const [open, setOpen] = useState(false);
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  useEffect(() => {
    const unsub = subscribeTabAudioGuide((resolve) => {
      setResolver(() => resolve);
      setOpen(true);
    });
    return unsub;
  }, []);

  const respond = (value: boolean) => {
    resolver?.(value);
    setResolver(null);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) respond(false);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-emerald-500" />
            Capture the interviewer's voice
          </DialogTitle>
          <DialogDescription>
            We need browser permission to listen to the interview. In the next
            dialog, follow these two steps:
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 text-xs font-semibold">
              1
            </span>
            <div className="flex-1">
              <p className="font-medium text-foreground flex items-center gap-1.5">
                <MonitorUp className="h-3.5 w-3.5" />
                Pick the interview tab (or window)
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose the browser tab or app where your meeting is running
                (Zoom, Meet, Teams, etc.).
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 text-xs font-semibold">
              2
            </span>
            <div className="flex-1">
              <p className="font-medium text-foreground flex items-center gap-1.5">
                <CheckSquare className="h-3.5 w-3.5" />
                Tick "Share tab audio" / "Share audio"
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This is the most-missed step. Without it we only hear you, not
                the interviewer. Then click <strong>Share</strong>.
              </p>
            </div>
          </li>
        </ol>

        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          We only use the audio — no video or screen contents are recorded or
          sent anywhere.
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => respond(false)}>
            Skip — mic only
          </Button>
          <Button onClick={() => respond(true)}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
