import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Message } from "../types";
import { useTranslation } from "react-i18next";

interface MessageListProps {
  messages: Message[];
  currentUserId?: string;
}

function formatLangLabel(code: string | undefined): string {
  if (!code) return "";
  return code.toUpperCase();
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <main
      className={cn(
        "flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4"
      )}
      role="log"
      aria-live="polite"
      aria-label={t('conversation.messages')}
      aria-atomic="false"
    >
      {messages.map((message, index) => {
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showSpeakerName = !prevMessage || prevMessage.speakerName !== message.speakerName || prevMessage.speakerId !== message.speakerId;
        const isOwn = message.speakerId === currentUserId;
        const langLabel = message.isTranslation
          ? formatLangLabel(message.targetLang)
          : formatLangLabel(message.sourceLang);
        const labelPrefix = message.isTranslation
          ? t('conversation.translationLabel', 'Translation')
          : isOwn
            ? t('conversation.youSaidLabel', 'You said')
            : t('conversation.originalLabel', 'Original');

        return (
          <div
            key={message.id}
            className={cn("flex flex-col", isOwn ? "items-end" : "items-start")}
            role="article"
            aria-label={`${isOwn ? t('conversation.yourMessage') : t('conversation.otherMessage')} ${new Date(message.timestamp).toLocaleTimeString()}`}
            data-testid="chat-message"
            data-is-own={isOwn}
          >
            {showSpeakerName && message.speakerName && (
              <div className={cn("text-xs text-muted-foreground mb-1 px-2", isOwn ? "text-right" : "text-left")}>
                {message.speakerName}
              </div>
            )}
            <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] sm:max-w-sm lg:max-w-md px-4 py-2 shadow-sm",
                  isOwn
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-none"
                    : "bg-card text-card-foreground border rounded-2xl rounded-tl-none"
                )}
              >
                <p className="leading-relaxed" data-testid="message-text">{message.text}</p>
                {langLabel && (
                  <div className={cn(
                    "text-[10px] uppercase tracking-wide mt-1 opacity-80",
                    isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {labelPrefix} ({langLabel})
                  </div>
                )}
                <time className="sr-only" dateTime={message.timestamp.toISOString()}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </time>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} aria-hidden="true" />
    </main>
  );
}
