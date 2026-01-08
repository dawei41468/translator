import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES } from "@/lib/languages";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ConversationControlsProps {
  isRecording: boolean;
  toggleRecording: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  pushToTalkEnabled: boolean;
  canStartRecording: boolean;
  connectionStatus: string;
  soloMode: boolean;
  toggleSoloMode: () => void;
  soloTargetLang: string;
  onSoloLangChange: (lang: string) => void;
  userLanguage: string | undefined;
}

export function ConversationControls({
  isRecording,
  toggleRecording,
  startRecording,
  stopRecording,
  pushToTalkEnabled,
  canStartRecording,
  connectionStatus,
  soloMode,
  toggleSoloMode,
  soloTargetLang,
  onSoloLangChange,
  userLanguage,
}: ConversationControlsProps) {
  const { t } = useTranslation();

  const MAX_DURATION_MS = 60_000;
  const LOCK_THRESHOLD_PX = 60;

  const [isLocked, setIsLocked] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const startYRef = useRef<number | null>(null);
  const timerIdRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const stopIssuedRef = useRef(false);
  const isRecordingRef = useRef(isRecording);
  const prevIsRecordingRef = useRef(isRecording);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const prev = prevIsRecordingRef.current;
    prevIsRecordingRef.current = isRecording;
    if (prev && !isRecording) {
      resetUi();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const clearTimer = () => {
    if (timerIdRef.current !== null) {
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  };

  const resetUi = () => {
    clearTimer();
    startYRef.current = null;
    startedAtRef.current = null;
    setIsHolding(false);
    setIsLocked(false);
    setSecondsLeft(60);
    stopIssuedRef.current = false;
  };

  const stopSession = () => {
    if (stopIssuedRef.current) return;
    stopIssuedRef.current = true;
    clearTimer();
    setIsHolding(false);
    setIsLocked(false);
    setSecondsLeft(60);
    stopRecording();
  };

  const startSession = (pointerY: number) => {
    if (connectionStatus !== 'connected') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (isRecordingRef.current) return;

    stopIssuedRef.current = false;
    startYRef.current = pointerY;
    setIsHolding(true);
    setIsLocked(false);

    startedAtRef.current = Date.now();
    setSecondsLeft(60);
    clearTimer();
    timerIdRef.current = window.setInterval(() => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MAX_DURATION_MS - elapsed);
      const nextSecondsLeft = Math.max(0, Math.ceil(remaining / 1000));
      setSecondsLeft(nextSecondsLeft);
      if (remaining <= 0) {
        stopSession();
      }
    }, 200);

    startRecording();
  };

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  const countdownText = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [secondsLeft]);

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t p-4 pb-8 sm:p-6 overscroll-contain touch-none" role="contentinfo">
      <Button
        type="button"
        variant={soloMode ? "default" : "outline"}
        size="sm"
        onClick={toggleSoloMode}
        aria-pressed={soloMode}
        aria-label={t('conversation.soloMode')}
        className="absolute bottom-4 left-4"
        data-testid="toggle-solo-mode"
      >
        Solo
      </Button>

      <div className="mb-4 flex flex-col items-center gap-3">
        {soloMode && (
          <div className="flex items-center justify-center gap-3">
            <label htmlFor="solo-language-select" className="sr-only">{t('conversation.translateTo')}</label>
            <Select
              value={soloTargetLang}
              onValueChange={onSoloLangChange}
            >
              <SelectTrigger id="solo-language-select" className="h-9 w-44" aria-label={t('conversation.translateTo')} data-testid="solo-language-select">
                <SelectValue placeholder={t('conversation.translateTo')} />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.filter((lang) => lang.code !== userLanguage).map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {soloMode && (
          <p className="text-center text-xs text-muted-foreground" id="solo-mode-description" role="note">
            {t('conversation.soloModeHint')}
          </p>
        )}
      </div>

      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-2">
          {(pushToTalkEnabled && isRecording) && (
            <div className={cn(
              "text-xs tabular-nums",
              secondsLeft <= 10 ? "text-destructive" : "text-muted-foreground"
            )} aria-live="polite">
              {countdownText}
            </div>
          )}

          <Button
            type="button"
            onClick={pushToTalkEnabled ? (isLocked ? stopSession : undefined) : toggleRecording}
            onPointerDown={pushToTalkEnabled ? (e) => {
              if (isLocked) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              if (!isRecordingRef.current && !canStartRecording) {
                startRecording();
                return;
              }
              startSession(e.clientY);
            } : undefined}
            onPointerMove={pushToTalkEnabled ? (e) => {
              if (!isHolding || isLocked) return;
              const startY = startYRef.current;
              if (startY === null) return;
              const dy = e.clientY - startY;
              if (dy < -LOCK_THRESHOLD_PX) {
                setIsLocked(true);
                setIsHolding(false);
              }
            } : undefined}
            onPointerUp={pushToTalkEnabled ? (e) => {
              if (!isHolding) return;
              e.preventDefault();
              if (!isLocked) stopSession();
            } : undefined}
            onPointerCancel={pushToTalkEnabled ? (e) => {
              if (!isHolding) return;
              e.preventDefault();
              if (!isLocked) stopSession();
            } : undefined}
            disabled={connectionStatus !== 'connected'}
            variant={isRecording ? "destructive" : "default"}
            size="lg"
            className={cn(
              "h-16 w-16 rounded-full shadow-lg transition-all focus:ring-4 focus:ring-primary/20",
              isRecording ? "animate-pulse scale-110" : "hover:scale-105"
            )}
            aria-pressed={isRecording}
            aria-label={
              pushToTalkEnabled
                ? (isLocked ? 'Stop' : (isRecording ? 'Release to stop' : 'Hold to talk'))
                : (isRecording ? t('conversation.stopSpeaking') : t('conversation.startSpeaking'))
            }
            data-testid="toggle-recording"
          >
            {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
          </Button>

          {pushToTalkEnabled && isLocked && (
            <div className="text-xs text-muted-foreground" aria-live="polite">
              Stop
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
