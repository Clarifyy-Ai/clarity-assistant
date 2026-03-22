import { useRef, useEffect } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import type { ChatMessage } from "@/store/overlayStore";
import { OverlayChatInput } from "./OverlayChatInput";
import { cn } from "@/lib/utils";

interface OverlayChatPanelProps {
  onSubmit: (question: string) => void;
}

export function OverlayChatPanel({ onSubmit }: OverlayChatPanelProps) {
  const chatHistory = useOverlayStore((s) => s.chat_history);
  const isGenerating = useOverlayStore((s) => s.is_chat_generating);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {chatHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center mb-3">
              <svg className="w-4 h-4 text-brand-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-[11px] font-medium text-muted-foreground/60">Ask anything</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1 max-w-[200px]">
              Type a question below to get AI-powered guidance during your interview.
            </p>
          </div>
        )}

        {chatHistory.map((msg, i) => (
          <ChatBubble key={i} message={msg} />
        ))}

        {isGenerating && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-3 py-2 rounded-xl bg-white/5 text-overlay-text">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <OverlayChatInput onSubmit={onSubmit} />
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const time = new Date(message.timestamp);
  const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed",
          isUser
            ? "bg-brand-500/20 text-brand-200 rounded-br-sm"
            : "bg-white/5 text-overlay-text rounded-bl-sm"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <p className={cn(
          "text-[8px] mt-1",
          isUser ? "text-brand-300/40 text-right" : "text-muted-foreground/30"
        )}>
          {timeStr}
        </p>
      </div>
    </div>
  );
}
