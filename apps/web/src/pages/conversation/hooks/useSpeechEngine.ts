import { useRef, useState, useEffect, useCallback } from "react";
import { Socket } from "socket.io-client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMicVAD } from "@ricky0123/vad-react";
import { PcmRecorder } from "@/lib/audio/pcm-recorder";
import { getSpeechRecognitionLocale } from "../utils";

interface UseSpeechEngineProps {
  socketRef: React.MutableRefObject<Socket | null>;
  userLanguage: string | undefined;
  disableAutoStopOnSilence?: boolean;
}

interface S2SStatus {
  isRecording: boolean;
  language: string;
  lastAttempt?: string;
  lastError?: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useSpeechEngine({
  socketRef,
  userLanguage,
  disableAutoStopOnSilence,
}: UseSpeechEngineProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const isStartingRef = useRef(false);
  const lifecycleTokenRef = useRef(0);
  const pcmRecorderRef = useRef<PcmRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<ReturnType<typeof useMicVAD> | null>(null);
  const tRef = useRef(t);
  const isUserSpeakingRef = useRef(false);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const bufferedAudioChunksRef = useRef<string[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const lastSpeechActivityAtRef = useRef<number>(0);
  const hasStartedUtteranceRef = useRef(false);
  const SAMPLE_RATE = 24000;
  const SILENCE_THRESHOLD_MS = 2500;
  const PCM_WARMUP_SEND_MS = 1200;

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [status, setStatus] = useState<S2SStatus>({
    isRecording: false,
    language: getSpeechRecognitionLocale(userLanguage ?? "en"),
  });

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const disableAutoStopOnSilenceRef = useRef(Boolean(disableAutoStopOnSilence));
  useEffect(() => {
    disableAutoStopOnSilenceRef.current = Boolean(disableAutoStopOnSilence);
  }, [disableAutoStopOnSilence]);

  const stopRecordingInternalImpl = useCallback((opts?: { skipVadPause?: boolean }) => {
    try {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      bufferedAudioChunksRef.current = [];
      recordingStartedAtRef.current = null;
      hasStartedUtteranceRef.current = false;

      if (!opts?.skipVadPause) {
        void vadRef.current?.pause().catch(() => {
          // Ignore VAD pause errors during cleanup
        });
      }

      if (pcmRecorderRef.current) {
        pcmRecorderRef.current.stop();
        pcmRecorderRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
          track.onended = null;
          track.onmute = null;
          track.onunmute = null;
        });
        streamRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.emit("stop-utterance");
      }

      isRecordingRef.current = false;
      setIsRecording(false);
      setStatus((prev) => ({
        ...prev,
        isRecording: false,
        lastAttempt: "Recording stopped",
      }));
    } catch (error) {
      setIsRecording(false);
      setStatus((prev) => ({
        ...prev,
        isRecording: false,
        lastError: `Cleanup error: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }
  }, [socketRef]);

  const stopRecordingInternal = useCallback(() => {
    lifecycleTokenRef.current += 1;
    isStartingRef.current = false;
    stopRecordingInternalImpl();
  }, [stopRecordingInternalImpl]);

  const stopRecordingForUnmount = useCallback(() => {
    lifecycleTokenRef.current += 1;
    isStartingRef.current = false;
    stopRecordingInternalImpl({ skipVadPause: true });
  }, [stopRecordingInternalImpl]);

  const flushBufferedAudio = useCallback((socket: Socket) => {
    if (bufferedAudioChunksRef.current.length === 0) return;
    for (const chunk of bufferedAudioChunksRef.current) {
      socket.emit("utterance-audio", { base64Audio: chunk });
    }
    bufferedAudioChunksRef.current = [];
  }, []);

  const onVADSpeechStart = useCallback(() => {
    lastSpeechActivityAtRef.current = Date.now();
    isUserSpeakingRef.current = true;

    const socket = socketRef.current;
    if (socket?.connected && bufferedAudioChunksRef.current.length > 0) {
      flushBufferedAudio(socket);
    }

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, [socketRef, flushBufferedAudio]);

  const onVADSpeechEnd = useCallback(() => {
    lastSpeechActivityAtRef.current = Date.now();
    isUserSpeakingRef.current = false;

    if (disableAutoStopOnSilenceRef.current) {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      return;
    }

    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    silenceTimeoutRef.current = setTimeout(() => {
      stopRecordingInternal();
    }, SILENCE_THRESHOLD_MS);
  }, [stopRecordingInternal]);

  const onVADMisfire = useCallback(() => {
    isUserSpeakingRef.current = false;
  }, []);

  const vad = useMicVAD({
    startOnLoad: true,
    baseAssetPath: "/vad/",
    onnxWASMBasePath: "/vad/",
    model: "v5",
    // Mobile optimization: Robust settings to prevent clipping
    positiveSpeechThreshold: 0.6,
    negativeSpeechThreshold: 0.4,
    redemptionMs: 750, // 24 frames @ ~30ms
    preSpeechPadMs: 300, // 10 frames @ ~30ms
    minSpeechMs: 120, // 4 frames @ ~30ms
    onSpeechStart: onVADSpeechStart,
    onSpeechEnd: onVADSpeechEnd,
    onVADMisfire: onVADMisfire,
  });

  useEffect(() => {
    if (vad.errored) {
      socketRef.current?.emit("client-error", {
        code: "VAD_ERROR",
        message: "VAD failed to load",
        details: vad.errored,
      });
    }
    if (vad.loading || vad.errored) return;
    if (isRecordingRef.current) return;
    if (!vad.listening) return;

    void vad.pause().catch(() => {
      // Ignore VAD pause errors
    });
  }, [vad.loading, vad.errored, vad.listening, vad.pause, socketRef]);

  useEffect(() => {
    vadRef.current = vad;
  }, [vad]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" && isRecordingRef.current) {
        stopRecordingInternal();
      }
    };

    const onPageHide = () => {
      if (isRecordingRef.current) {
        stopRecordingInternal();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [stopRecordingInternal]);

  const startRecordingInternal = useCallback(async () => {
    if (isRecordingRef.current || isStartingRef.current) return;
    const token = (lifecycleTokenRef.current += 1);
    isStartingRef.current = true;
    recordingStartedAtRef.current = Date.now();
    hasStartedUtteranceRef.current = false;

    try {
      const socket = socketRef.current;
      if (!socket) return;

      const languageCode = getSpeechRecognitionLocale(userLanguage ?? "en");
      setStatus({
        isRecording: false,
        language: languageCode,
        lastAttempt: `Starting S2S recording in ${languageCode}`,
        lastError: undefined,
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: SAMPLE_RATE },
          channelCount: { ideal: 1 },
        },
      });

      if (token !== lifecycleTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      // Emit start-utterance immediately so the server can prepare sessions.
      socket.emit("start-utterance", { languageCode });
      hasStartedUtteranceRef.current = true;

      const pcmRecorder = new PcmRecorder();
      pcmRecorderRef.current = pcmRecorder;

      const handlePcmData = (data: ArrayBuffer) => {
        const currentSocket = socketRef.current;
        const base64 = arrayBufferToBase64(data);

        if (!currentSocket?.connected) {
          bufferedAudioChunksRef.current.push(base64);
          if (bufferedAudioChunksRef.current.length > 40) {
            bufferedAudioChunksRef.current.shift();
          }
          return;
        }

        const now = Date.now();
        const startedAt = recordingStartedAtRef.current;
        const inWarmup = typeof startedAt === "number" && now - startedAt < PCM_WARMUP_SEND_MS;
        const recentlySpoke = now - lastSpeechActivityAtRef.current < 1200;
        const shouldSend = disableAutoStopOnSilenceRef.current || isUserSpeakingRef.current || recentlySpoke || inWarmup;

        const flushBuffered = () => {
          if (bufferedAudioChunksRef.current.length === 0) return;
          for (const chunk of bufferedAudioChunksRef.current) {
            currentSocket.emit("utterance-audio", { base64Audio: chunk });
          }
          bufferedAudioChunksRef.current = [];
        };

        if (shouldSend) {
          flushBuffered();
          currentSocket.emit("utterance-audio", { base64Audio: base64 });
          return;
        }

        // Buffer a short window of audio so the beginning of a short utterance isn't lost.
        bufferedAudioChunksRef.current.push(base64);
        if (bufferedAudioChunksRef.current.length > 12) {
          bufferedAudioChunksRef.current.shift();
        }
      };

      await pcmRecorder.start(stream, handlePcmData, SAMPLE_RATE);

      if (token !== lifecycleTokenRef.current) {
        stopRecordingInternalImpl({ skipVadPause: true });
        return;
      }

      // Start VAD
      await vadRef.current?.start();

      if (token !== lifecycleTokenRef.current) {
        stopRecordingInternalImpl({ skipVadPause: true });
        return;
      }

      isRecordingRef.current = true;
      setIsRecording(true);
      setStatus((prev) => ({
        ...prev,
        isRecording: true,
        lastAttempt: `S2S recording started in ${languageCode}`,
      }));
    } catch (err) {
      if (token !== lifecycleTokenRef.current) {
        return;
      }
      setStatus((prev) => ({
        ...prev,
        lastError: `Failed to start: ${err instanceof Error ? err.message : String(err)}`,
        isRecording: false,
      }));
      toast.error(tRef.current("error.generic"));
      socketRef.current?.emit("client-error", {
        code: "RECORDING_START_FAILED",
        message: err instanceof Error ? err.message : String(err),
        details: { userLanguage },
      });
      stopRecordingInternal();
    } finally {
      if (token === lifecycleTokenRef.current) {
        isStartingRef.current = false;
      }
    }
  }, [socketRef, userLanguage, stopRecordingInternal, stopRecordingInternalImpl]);

  const startRecording = useCallback(() => {
    void startRecordingInternal();
  }, [startRecordingInternal]);

  const stopRecording = useCallback(() => {
    stopRecordingInternal();
  }, [stopRecordingInternal]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecordingInternal();
    } else {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        toast.error(tRef.current("error.offline", "You are offline"));
        return;
      }
      void startRecordingInternal();
    }
  }, [isRecording, stopRecordingInternal, startRecordingInternal]);

  return {
    isRecording,
    status,
    toggleRecording,
    startRecording,
    stopRecording,
    stopRecordingInternal,
    stopRecordingForUnmount,
    setStatus,
  };
}
