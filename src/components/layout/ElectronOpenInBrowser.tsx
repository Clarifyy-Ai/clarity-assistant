import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ExternalLink, Globe, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { openInBrowser, getWebAppUrl } from "@/lib/platform/openInBrowser";
import { ELECTRON_DEFAULT_PATH } from "@/lib/platform/electronRoutes";
import { Link } from "react-router-dom";

interface ElectronOpenInBrowserProps {
  /** Override path; defaults to current location (pathname + search). */
  webPath?: string;
  /** Open browser automatically on mount. */
  autoOpen?: boolean;
}

/**
 * Shown in the desktop app when the user hits a route that belongs in the browser.
 */
export function ElectronOpenInBrowser({
  webPath,
  autoOpen = true,
}: ElectronOpenInBrowserProps): JSX.Element {
  const location = useLocation();
  const targetPath = webPath ?? `${location.pathname}${location.search}`;

  useEffect(() => {
    if (autoOpen) {
      openInBrowser(targetPath);
    }
  }, [autoOpen, targetPath]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 space-y-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Globe className="h-6 w-6 text-primary" />
          </div>

          <div className="space-y-2">
            <h1 className="text-lg font-semibold text-foreground">Open in your browser</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your browser has the full Clarify AI product — dashboard, prep, billing, and mock
              interviews. The desktop app is a lightweight upgrade for Practice Coach overlay
              convenience during live practice.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full"
              leftIcon={<ExternalLink className="h-4 w-4" />}
              onClick={() => openInBrowser(targetPath)}
            >
              Continue in browser
            </Button>
            <Link to={ELECTRON_DEFAULT_PATH}>
              <Button type="button" variant="outline" className="w-full" leftIcon={<Monitor className="h-4 w-4" />}>
                Back to Practice Coach
              </Button>
            </Link>
          </div>

          <p className="text-[10px] text-muted-foreground break-all">
            {getWebAppUrl(targetPath)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
