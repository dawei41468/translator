import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Message } from "../types";
import { useTranslation } from "react-i18next";

interface MessageListProps {
  messages: Message[];
  soloMode: boolean;
}

export function MessageList({ messages, soloMode }: MessageListProps) {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <main 
      className={cn(
        "flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 pt-32",
        soloMode ? "pb-48" : "pb-40"
      )} 
      role="log" 
      aria-live="polite" 
      aria-label={t('conversation.messages')} 
      aria-atomic="false"
    >
      {messages.map((message, index) => {
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showSpeakerName = !prevMessage || prevMessage.speakerName !== message.speakerName;

        return (
          <div
            key={message.id}
            className={cn("flex flex-col", message.isOwn ? "items-end" : "items-start")}
            role="article"
            aria-label={`${message.isOwn ? t('conversation.yourMessage') : t('conversation.otherMessage')} ${new Date(message.timestamp).toLocaleTimeString()}`}
            data-testid="chat-message"
            data-is-own={message.isOwn}
          >
            {showSpeakerName && message.speakerName && (
              <div className={cn("text-xs text-muted-foreground mb-1 px-2", message.isOwn ? "text-right" : "text-left")}>
                {message.speakerName}
              </div>
            )}
            <div className={cn("flex", message.isOwn ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] sm:max-w-sm lg:max-w-md px-4 py-2 shadow-sm",
                  message.isOwn
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-none"
                    : "bg-card text-card-foreground border rounded-2xl rounded-tl-none"
                )}
              >
                {message.translatedText ? (
                  <>
                    <p className="text-base font-medium leading-relaxed" data-testid="message-translated-text">
                      {message.translatedText}
                    </p>
                    <p
                      className={cn(
                        "text-xs mt-2 border-t pt-2 italic",
                        message.isOwn
                          ? "text-primary-foreground/70 border-primary-foreground/20"
                          : "text-muted-foreground border-border/50"
                      )}
                      data-testid="message-original-text"
                    >
                      <span className="sr-only">{t('conversation.originalText', 'Original')}: </span>
                      {message.text}
                    </p>
                  </>
                ) : (
                  <p className="leading-relaxed" data-testid="message-text">{message.text}</p>
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
