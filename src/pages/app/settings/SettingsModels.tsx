// src/pages/app/settings/SettingsModels.tsx
//
// P0-4 (production audit): launch ships Gemini-only. The previous UI offered
// GPT-4o / Claude / Gemini choices with smart routing and a fallback queue —
// none of which were reachable in the runtime router. To prevent any user
// from seeing a model choice we cannot honour, this page is a read-only
// disclosure card. Re-introduce a picker only when modelRouter actually
// routes to multiple providers again.

import { Card } from "@/components/ui/Card";
import { Cpu } from "lucide-react";

export default function SettingsModels() {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">AI Models</h2>

      <Card>
        <div className="flex items-start gap-3">
          <Cpu className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              Google Gemini 2.0 Flash
            </h3>
            <p className="text-xs text-muted-foreground">
              All AI features in Clarify currently use Google Gemini 2.0 Flash
              for the best balance of speed, quality, and cost. Additional
              models may be added in a future release.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-1">
          Model selection coming soon
        </h3>
        <p className="text-xs text-muted-foreground">
          We&apos;re evaluating support for additional providers. Until then,
          there is no per-user model choice to configure.
        </p>
      </Card>
    </div>
  );
}
