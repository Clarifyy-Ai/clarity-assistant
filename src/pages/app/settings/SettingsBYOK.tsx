// src/pages/app/settings/SettingsBYOK.tsx
//
// P0-5 (production audit): the BYOK (bring-your-own-key) flow was removed
// from the launch product. Provider keys are no longer stored, encrypted,
// or attached to AI requests. This page now renders a short disclosure.
// The /app/settings/byok route is also unregistered in App.tsx — this file
// is kept only so any cached deep-links resolve to a clear message instead
// of a 404 during the deprecation window.

import { Card } from "@/components/ui/Card";
import { ShieldCheck } from "lucide-react";

export default function SettingsBYOK() {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">API Keys</h2>

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              Bring-your-own-key is not available at launch
            </h3>
            <p className="text-xs text-muted-foreground">
              All AI calls are billed through your Clarify credits using our
              managed provider. Personal OpenAI / Anthropic / Google keys are
              not accepted right now. Any keys previously saved on this device
              have been removed.
            </p>
            <p className="text-xs text-muted-foreground">
              We&apos;re evaluating a future BYOK option backed by a
              server-side encrypted vault. Until then, this setting is
              disabled.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
