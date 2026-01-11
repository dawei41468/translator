import { Button } from "@/components/ui/button";
import { Mic, MicOff, Lock, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/haptics";

interface ConversationControlsProps {
  isRecording: boolean;
  toggleRecording: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  pushToTalkEnabled: boolean;
  canStartRecording: boolean;
  connectionStatus: string;
  openSettings: () => void;
}

export function ConversationControls({
  isRecording,
  toggleRecording,
  startRecording,
  stopRecording,
  pushToTalkEnabled,
  canStartRecording,
  connectionStatus,
  openSettings,
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
    haptics.medium();
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

    haptics.light();
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

  const recordingDisabled = connectionStatus !== 'connected' || (!canStartRecording && !isRecording);

  const statusLabel = useMemo(() => {
    if (isRecording) {
      if (pushToTalkEnabled && isLocked) return t('conversation.recordingLocked', 'Recording (locked)');
      return t('conversation.recording', 'Recording...');
    }

    if (!recordingDisabled) return null;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return t('connection.disconnected', 'Offline');
    }

    switch (connectionStatus) {
      case 'connecting':
        return t('connection.connecting', 'Connecting...');
      case 'reconnecting':
        return t('connection.reconnecting', 'Reconnecting...');
      case 'disconnected':
        return t('connection.disconnected', 'Offline');
      default:
        return t('connection.disconnected', 'Offline');
    }
  }, [canStartRecording, connectionStatus, isLocked, isRecording, pushToTalkEnabled, recordingDisabled, t]);

  return (
    <footer className="relative p-4 pb-8 sm:p-6 overscroll-contain touch-none" role="contentinfo">
      <div className="mb-4 flex flex-col items-center gap-2">
        {!canStartRecording && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground" role="note">
              {t('conversation.onlyParticipantHint')}
            </p>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-0 h-auto"
              onClick={openSettings}
            >
              {t('common.settings', 'Settings')}
            </Button>
          </div>
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

          {pushToTalkEnabled && isHolding && !isLocked && (
            <div className="absolute bottom-28 flex flex-col items-center text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-300">
              <ChevronUp className="h-4 w-4 animate-bounce" />
              <Lock className={cn("h-4 w-4 mt-1", isLocked ? "text-primary" : "")} />
            </div>
          )}

          <div className="relative">
            {/* Ripple Effects for Active Recording */}
            {isRecording && (
              <>
                <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute inset-0 rounded-full bg-red-500/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
              </>
            )}

            <Button
              type="button"
              onClick={pushToTalkEnabled ? (isLocked ? stopSession : undefined) : () => {
                if (!isRecording) haptics.light();
                else haptics.medium();
                toggleRecording();
              }}
              onPointerDown={pushToTalkEnabled ? (e) => {
                if (isLocked) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
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
                  haptics.medium();
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
              onContextMenu={(e) => {
                e.preventDefault();
              }}
              disabled={recordingDisabled}
              variant={isRecording ? "destructive" : "default"}
              size="lg"
              className={cn(
                "relative z-10 h-20 w-20 rounded-full shadow-xl transition-all duration-300 focus:ring-4 focus:ring-primary/20 border-4 border-background select-none touch-none",
                isRecording ? "scale-110 bg-red-600 hover:bg-red-700 ring-4 ring-red-500/30" : "hover:scale-105"
              )}
              style={{
                WebkitTouchCallout: 'none',
                touchAction: 'none',
              }}
              aria-pressed={isRecording}
              aria-label={
                pushToTalkEnabled
                  ? (isLocked ? 'Stop' : (isRecording ? 'Release to stop' : 'Hold to talk'))
                  : (isRecording ? t('conversation.stopSpeaking') : t('conversation.startSpeaking'))
              }
              data-testid="toggle-recording"
            >
              {isRecording ? <MicOff className="h-8 w-8 animate-pulse" /> : <Mic className="h-8 w-8" />}
            </Button>
          </div>

          {statusLabel && (
            <div className="text-xs text-muted-foreground" aria-live="polite" data-testid="recording-status">
              {statusLabel}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
