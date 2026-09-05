// src/components/overlay/OverlayChatPanel.tsx
import { useRef, useEffect, useState, useMemo } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { OverlayChatInput } from "./OverlayChatInput";
import { AiFormattedOutput } from "@/components/common/AiFormattedOutput";
import { hybridSourceLabel, isDegradedCoachSource } from "@/lib/hybrid/hybridSourceMeta";
import { ChevronDown, StickyNote, MessageSquare } from "lucide-react";
import {
  buildSessionConversationTimeline,
  chatAttentionBannerCopy,
  type SessionConversationItem,
} from "@/lib/overlay/sessionConversation";

interface OverlayChatPanelProps {
  onSubmit: (question: string) => void | boolean | Promise<void | boolean>;
}

export function OverlayChatPanel({ onSubmit }: OverlayChatPanelProps) {
  const chatHistory = useOverlayStore((s) => s.chat_history);
  const hintHistory = useOverlayStore((s) => s.hint_history);
  const isGenerating = useOverlayStore((s) => s.is_chat_generating);
  const chatAttention = useOverlayStore((s) => s.chat_attention);
  const chatAttentionReason = useOverlayStore((s) => s.chat_attention_reason);
  const chatPrefill = useOverlayStore((s) => s.chat_prefill);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [padText, setPadText] = useState("");

  const timeline = useMemo(
    () =>
      buildSessionConversationTimeline({
        chatHistory,
        hintHistory,
        systemNotice:
          chatAttention && chatAttentionReason
            ? chatAttentionBannerCopy(chatAttentionReason)
            : null,
      }),
    [chatHistory, hintHistory, chatAttention, chatAttentionReason],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [timeline.length, isGenerating]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5",
          "scroll-container",
        )}
      >
        {timeline.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/10">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-[13px] font-semibold text-white/60">Ask your coach</p>
            <p className="text-[12px] text-white/25 mt-1 max-w-[200px] leading-relaxed">
              Session Q&amp;A and coach chat stay here. Type a question when listening can&apos;t catch it.
            </p>
          </div>
        )}

        {timeline.map((msg) => (
          <ConversationBubble key={msg.id} message={msg} />
        ))}

        {isGenerating && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-white/[0.05] border border-white/[0.07]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
                <span
                  className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.05] shrink-0">
        <button
          onClick={() => setPadOpen((p) => !p)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-white/25 hover:text-white/45 transition-colors"
          type="button"
        >
          <StickyNote className="w-3 h-3" />
          <span className="font-bold uppercase tracking-widest">Scratch‑pad</span>
          <ChevronDown
            className={cn(
              "w-3 h-3 ml-auto transition-transform duration-200",
              padOpen && "rotate-180",
            )}
          />
        </button>

        {padOpen && (
          <textarea
            value={padText}
            onChange={(e) => setPadText(e.target.value)}
            placeholder="Quick notes — not saved, not sent to AI…"
            className="w-full px-3 pb-2 bg-transparent text-[12px] text-white/65 placeholder:text-white/20 resize-none focus:outline-none leading-relaxed"
            rows={4}
          />
        )}
      </div>

      <OverlayChatInput
        onSubmit={onSubmit}
        initialValue={chatPrefill}
        onInitialValueConsumed={() => {
          useOverlayStore.getState().consumeChatPrefill();
        }}
      />
    </div>
  );
}

function ConversationBubble({ message }: { message: SessionConversationItem }) {
  const isUser = message.role === "user" || message.role === "question";
  const isSystem = message.role === "system";
  const safeText = String(message.text ?? "");
  const time = new Date(message.timestamp);
  const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  const roleLabel =
    message.role === "question"
      ? "Detected question"
      : message.role === "suggestion"
        ? "Suggestion"
        : message.role === "system"
          ? "Tip"
          : null;

  if (isSystem) {
    return (
      <div className="flex justify-center animate-fade-in px-1">
        <p className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 leading-relaxed text-center max-w-[95%]">
          {safeText}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex animate-fade-in", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed",
          isUser
            ? "bg-gradient-to-br from-indigo-600/30 to-primary/20 text-indigo-100 rounded-br-sm border border-indigo-500/20 shadow-sm shadow-indigo-500/10"
            : "bg-white/[0.05] text-white/80 rounded-bl-sm border border-white/[0.08]",
        )}
      >
        {roleLabel && (
          <p className="text-[9px] uppercase tracking-wider opacity-50 mb-1">{roleLabel}</p>
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">
            {safeText || (message.pending ? "…" : "…")}
          </p>
        ) : (
          <AiFormattedOutput
            text={safeText || (message.pending ? "…" : "…")}
            className="text-[13px] leading-relaxed break-words"
          />
        )}
        {!isUser && !message.pending && isDegradedCoachSource(message.source) ? (
          <p className="text-[10px] mt-1.5 text-amber-200/80">
            Offline / degraded coach — not a full AI answer. Retry when AI is available.
          </p>
        ) : null}
        <p
          className={cn(
            "text-[10px] mt-1.5",
            isUser ? "text-indigo-300/35 text-right" : "text-white/20",
          )}
        >
          {timeStr}
          {!isUser && !message.pending && hybridSourceLabel(message.source) ? (
            <span className="ml-1.5 opacity-80">· {hybridSourceLabel(message.source)}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
