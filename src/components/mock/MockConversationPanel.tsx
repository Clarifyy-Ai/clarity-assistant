// ✅ FIX P2-A: Alternating interviewer / candidate turns from audioStore.

import { memo } from "react";
import { useAudioStore } from "@/store/audioStore";
import { cn } from "@/lib/utils";

export const MockConversationPanel = memo(function MockConversationPanel() {
  const utterances = useAudioStore((s) => s.transcript?.utterances ?? []);
  const interim = useAudioStore((s) => s.transcript?.interim_text ?? "");

  const finals = utterances.filter((u) => u.is_final);

  if (finals.length === 0 && !interim.trim()) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">
        Conversation transcript will appear here as you practice.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
      {finals.map((u) => (
        <div
          key={u.id}
          className={cn(
            "rounded-xl px-3 py-2 text-xs leading-relaxed border",
            u.speaker === "interviewer"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-100/90 ml-0 mr-6"
              : "bg-blue-500/10 border-blue-500/20 text-blue-100/90 ml-6 mr-0",
          )}
        >
          <span className="block text-[10px] font-bold uppercase tracking-wide mb-0.5 opacity-70">
            {u.speaker === "interviewer" ? "Interviewer" : "You"}
          </span>
          {u.text}
        </div>
      ))}
      {interim.trim() && (
        <div className="rounded-xl px-3 py-2 text-xs italic text-muted-foreground border border-dashed border-border ml-6">
          You (speaking…) {interim}
        </div>
      )}
    </div>
  );
});
