import { Link } from "react-router-dom";
import { Monitor, Download, Mic, Keyboard, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import {
  DESKTOP_INSTALL_GUIDE_PATH,
  getDesktopDownloadHref,
  isDesktopDownloadExternal,
} from "@/lib/constants/desktopDownload";

interface DesktopOnlyGateProps {
  featureName?: string;
  description?: string;
}

const DESKTOP_BENEFITS = [
  { icon: Mic, text: "System-wide microphone and optional tab audio capture" },
  { icon: Keyboard, text: "Global hotkeys — toggle overlay and generate answers" },
  { icon: Monitor, text: "Floating always-on-top Practice Coach window" },
];

export function DesktopOnlyGate({
  featureName = PRODUCT_NAMES.practiceCoach,
  description = "Live AI coaching with the floating overlay and global hotkeys is available in the Clarify AI desktop app only. The web app still supports mock interviews, prep lab, and gov exam practice.",
}: DesktopOnlyGateProps) {
  const externalDownload = isDesktopDownloadExternal();
  const downloadHref = getDesktopDownloadHref();

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
          <Monitor className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{featureName} — desktop app only</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Why desktop?
          </p>
          <ul className="space-y-3">
            {DESKTOP_BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-foreground">
                <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {externalDownload ? (
          <a href={downloadHref} target="_blank" rel="noopener noreferrer">
            <Button className="w-full sm:w-auto">
              <Download className="w-4 h-4 mr-2" />
              Download desktop app
              <ExternalLink className="w-3.5 h-3.5 ml-1.5 opacity-70" />
            </Button>
          </a>
        ) : (
          <Link to={DESKTOP_INSTALL_GUIDE_PATH}>
            <Button className="w-full sm:w-auto">
              <Download className="w-4 h-4 mr-2" />
              Install guide
            </Button>
          </Link>
        )}
        <Link to="/app/dashboard">
          <Button variant="outline" className="w-full sm:w-auto">
            Back to dashboard
          </Button>
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
        <p className="text-xs font-semibold text-foreground">Continue in the browser</p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/mock"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Mock Interview
            <ArrowRight className="w-3 h-3" />
          </Link>
          <Link
            to="/app/prep"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Prep Lab
            <ArrowRight className="w-3 h-3" />
          </Link>
          <Link
            to="/app/mock-test"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Gov Exam Tests
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
