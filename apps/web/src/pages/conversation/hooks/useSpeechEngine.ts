import { useRef, useState, useEffect, useCallback } from "react";
import { Socket } from "socket.io-client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMicVAD } from "@ricky0123/vad-react";
import { SpeechEngineRegistry } from "@/lib/speech-engines/registry";
import { SttStatus, TtsStatus } from "../types";
import { getTtsLocale, getSpeechRecognitionLocale } from "../utils";

interface UseSpeechEngineProps {
  speechEngineRegistry: SpeechEngineRegistry;
  socketRef: React.MutableRefObject<Socket | null>;
  userLanguage: string | undefined;
  audioEnabled: boolean;
  soloMode: boolean;
  soloTargetLang: string;
  disableAutoStopOnSilence?: boolean;
}

export function useSpeechEngine({
  speechEngineRegistry,
  socketRef,
  userLanguage,
  audioEnabled,
  soloMode,
  soloTargetLang,
  disableAutoStopOnSilence,
}: UseSpeechEngineProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const isStartingRef = useRef(false);
  const lifecycleTokenRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<ReturnType<typeof useMicVAD> | null>(null);
  const pendingTtsRef = useRef<{ text: string; language: string | null | undefined } | null>(null);
  const tRef = useRef(t);
  const isUserSpeakingRef = useRef(false);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const requestDataIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechActivityAtRef = useRef<number>(0);
  const bufferedAudioChunksRef = useRef<Blob[]>([]);
  const SILENCE_THRESHOLD_MS = 10000; // 10 seconds of silence before auto-stop

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [sttStatus, setSttStatus] = useState<SttStatus>({
    isRecording: false,
    recognitionStarted: false,
    transcriptsReceived: 0,
    language: 'en-US',
  });

  const [ttsStatus, setTtsStatus] = useState<TtsStatus>({
    voicesCount: 0,
    isSpeaking: false,
    voicesLoaded: false,
  });

  const audioEnabledRef = useRef(audioEnabled);
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  const soloModeRef = useRef(soloMode);
  useEffect(() => {
    soloModeRef.current = soloMode;
  }, [soloMode]);

  const disableAutoStopOnSilenceRef = useRef(Boolean(disableAutoStopOnSilence));
  useEffect(() => {
    disableAutoStopOnSilenceRef.current = Boolean(disableAutoStopOnSilence);
  }, [disableAutoStopOnSilence]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const speakTextNow = useCallback(async (text: string, language: string | null | undefined) => {
    if (!audioEnabledRef.current) {
      setTtsStatus(prev => ({ ...prev, lastAttempt: 'Audio disabled' }));
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setTtsStatus(prev => ({ ...prev, lastAttempt: 'Offline', lastError: 'Offline', isSpeaking: false }));
      return;
    }

    const ttsEngine = speechEngineRegistry.getTtsEngine();
    if (!ttsEngine) {
      setTtsStatus(prev => ({ ...prev, lastError: 'No TTS engine available', lastAttempt: 'Failed - no engine' }));
      toast.error(tRef.current('conversation.ttsNotSupported'));
      return;
    }

    const locale = getTtsLocale(language);
    try {
      setTtsStatus(prev => ({ ...prev, isSpeaking: true, lastError: undefined, lastAttempt: `Speaking (${locale})` }));
      await ttsEngine.speak(text, language || 'en');
      setTtsStatus(prev => ({ ...prev, isSpeaking: false, lastError: undefined, lastAttempt: `Finished (${locale})` }));
    } catch (error) {
      setTtsStatus(prev => ({ ...prev, lastError: `Error: ${error}`, isSpeaking: false, lastAttempt: `Failed (${locale})` }));
      toast.error(tRef.current('conversation.ttsError'));
    }
  }, [speechEngineRegistry]);

  const speakText = useCallback((text: string, language: string | null | undefined) => {
    if (isRecordingRef.current) {
      pendingTtsRef.current = { text, language };
      return;
    }
    speakTextNow(text, language);
  }, [speakTextNow]);

  const flushPendingTts = useCallback(() => {
    const pending = pendingTtsRef.current;
    if (!pending) return;
    pendingTtsRef.current = null;
    speakTextNow(pending.text, pending.language);
  }, [speakTextNow]);

  const stopRecordingInternalImpl = useCallback((opts?: { skipVadPause?: boolean }) => {
    try {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      if (requestDataIntervalRef.current) {
        clearInterval(requestDataIntervalRef.current);
        requestDataIntervalRef.current = null;
      }

      bufferedAudioChunksRef.current = [];

      const sttEngine = speechEngineRegistry.getSttEngine();
      if (sttEngine) {
        sttEngine.stopRecognition();
      }

      if (!opts?.skipVadPause) {
        void vadRef.current?.pause().catch((e) => {
          console.warn("VAD pause failed during cleanup:", e);
        });
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.onerror = null;
        mediaRecorderRef.current.ondataavailable = null;
      }
      mediaRecorderRef.current = null;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          track.onended = null;
          track.onmute = null;
          track.onunmute = null;
        });
        streamRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.emit('stop-speech');
      }

      isRecordingRef.current = false;
      setIsRecording(false);
      setSttStatus(prev => ({
        ...prev,
        isRecording: false,
        recognitionStarted: false,
        lastAttempt: 'Recognition stopped'
      }));

      flushPendingTts();
    } catch (error) {
      console.error('Error during audio cleanup:', error);
      setIsRecording(false);
      setSttStatus(prev => ({
        ...prev,
        isRecording: false,
        recognitionStarted: false,
        lastError: `Cleanup error: ${error instanceof Error ? error.message : String(error)}`
      }));
    }
  }, [speechEngineRegistry, socketRef, flushPendingTts]);

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

  const onVADSpeechStart = useCallback(() => {
    lastSpeechActivityAtRef.current = Date.now();
    isUserSpeakingRef.current = true;
    console.log("VAD: User started speaking");

    const socket = socketRef.current;
    if (socket?.connected && bufferedAudioChunksRef.current.length > 0) {
      for (const chunk of bufferedAudioChunksRef.current) {
        socket.emit('speech-data', chunk);
      }
    }
    bufferedAudioChunksRef.current = [];

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, [socketRef]);

  const onVADSpeechEnd = useCallback(() => {
    lastSpeechActivityAtRef.current = Date.now();
    isUserSpeakingRef.current = false;
    console.log("VAD: User stopped speaking");

    if (disableAutoStopOnSilenceRef.current) {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      return;
    }

    if (soloModeRef.current && isRecordingRef.current) {
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = setTimeout(() => {
        stopRecordingInternal();
      }, 250);
      return;
    }

    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    silenceTimeoutRef.current = setTimeout(() => {
      console.log("VAD: Auto-stopping due to silence");
      stopRecordingInternal();
    }, SILENCE_THRESHOLD_MS);
  }, [stopRecordingInternal]);

  const onVADMisfire = useCallback(() => {
    isUserSpeakingRef.current = false;
    console.log("VAD: Misfire detected");
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
    if (vad.loading || vad.errored) return;
    if (isRecordingRef.current) return;
    if (!vad.listening) return;

    void vad.pause().catch((e) => {
      console.warn("VAD pause failed after startOnLoad:", e);
    });
  }, [vad.loading, vad.errored, vad.listening, vad.pause]);

  useEffect(() => {
    vadRef.current = vad;
  }, [vad]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' && isRecordingRef.current) {
        stopRecordingInternal();
      }
    };

    const onPageHide = () => {
      if (isRecordingRef.current) {
        stopRecordingInternal();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [stopRecordingInternal]);

  const startRecordingInternal = useCallback(async () => {
    if (isRecordingRef.current || isStartingRef.current) return;
    const token = (lifecycleTokenRef.current += 1);
    isStartingRef.current = true;

    try {
      const socket = socketRef.current;
      if (!socket) return;

      // Resume AudioContext if it exists (user gesture)
      const ttsEngine = speechEngineRegistry.getTtsEngine();
      if (ttsEngine && (ttsEngine as any).audioContext?.state === 'suspended') {
        (ttsEngine as any).audioContext.resume().catch((e: any) => console.warn('Failed to resume AudioContext:', e));
      }

      const languageCode = getSpeechRecognitionLocale(userLanguage ?? "en");
      setSttStatus(prev => ({
        ...prev,
        lastAttempt: `Starting recognition in ${languageCode}`,
        language: languageCode,
        recognitionStarted: false,
        transcriptsReceived: 0,
        lastError: undefined
      }));

      const sttEngine = speechEngineRegistry.getSttEngine();
      const stream = await sttEngine.startRecognition({
        onResult: (text, isFinal) => {
          setSttStatus(prev => ({
            ...prev,
            transcriptsReceived: prev.transcriptsReceived + 1,
            lastAttempt: `Received: "${text.substring(0, 30)}..." (${isFinal ? 'final' : 'interim'})`
          }));

          if (isFinal) {
            socket.emit('speech-transcript', { transcript: text, sourceLang: languageCode.split('-')[0] });
          }
        },
        onError: (error) => {
          setSttStatus(prev => ({
            ...prev,
            lastError: `Error: ${error.message || error}`,
            recognitionStarted: false,
            isRecording: false
          }));
          toast.error('Speech recognition failed');
          stopRecordingInternal();
        }
      });

      if (token !== lifecycleTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      setSttStatus(prev => ({
        ...prev,
        recognitionStarted: true,
        isRecording: true,
        lastAttempt: `Recognition started in ${languageCode}`
      }));

      streamRef.current = stream;
      socket.emit('start-speech', {
        languageCode,
        soloMode,
        soloTargetLang: soloMode ? soloTargetLang : undefined,
      });

      // Start VAD
      await vadRef.current?.start();

      if (token !== lifecycleTokenRef.current) {
        stopRecordingInternalImpl({ skipVadPause: true });
        return;
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : null);

      if (!mimeType) {
        throw new Error('Audio recording is not supported on this device/browser. Please use a browser that supports WebM audio.');
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      if (token !== lifecycleTokenRef.current) {
        stopRecordingInternalImpl({ skipVadPause: true });
        return;
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size <= 0) return;

        if (!socket.connected) {
          bufferedAudioChunksRef.current.push(event.data);
          if (bufferedAudioChunksRef.current.length > 8) {
            bufferedAudioChunksRef.current.shift();
          }
          return;
        }

        if (disableAutoStopOnSilenceRef.current) {
          socket.emit('speech-data', event.data);
          return;
        }

        const now = Date.now();
        const recentlySpoke = now - lastSpeechActivityAtRef.current < 1200;
        const shouldSend = soloModeRef.current || isUserSpeakingRef.current || recentlySpoke;
        if (shouldSend) {
          socket.emit('speech-data', event.data);
          return;
        }

        bufferedAudioChunksRef.current.push(event.data);
        if (bufferedAudioChunksRef.current.length > 4) {
          bufferedAudioChunksRef.current.shift();
        }
      };

      mediaRecorder.start(250);

      // Android Chrome/PWA can be inconsistent about honoring timeslice; force periodic flush.
      if (requestDataIntervalRef.current) clearInterval(requestDataIntervalRef.current);
      requestDataIntervalRef.current = setInterval(() => {
        try {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.requestData();
          }
        } catch {
          // ignore
        }

        try {
          const sock = socketRef.current;
          if (!sock?.connected) return;
          if (bufferedAudioChunksRef.current.length === 0) return;

          if (disableAutoStopOnSilenceRef.current) {
            for (const chunk of bufferedAudioChunksRef.current) {
              sock.emit('speech-data', chunk);
            }
            bufferedAudioChunksRef.current = [];
            return;
          }

          const now = Date.now();
          const recentlySpoke = now - lastSpeechActivityAtRef.current < 1200;
          const shouldSend = soloModeRef.current || isUserSpeakingRef.current || recentlySpoke;
          if (!shouldSend) return;

          for (const chunk of bufferedAudioChunksRef.current) {
            sock.emit('speech-data', chunk);
          }
          bufferedAudioChunksRef.current = [];
        } catch {
          // ignore
        }
      }, 250);

      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (err) {
      if (token !== lifecycleTokenRef.current) {
        return;
      }
      setSttStatus(prev => ({
        ...prev,
        lastError: `Failed to start: ${err instanceof Error ? err.message : String(err)}`,
        recognitionStarted: false,
        isRecording: false
      }));
      toast.error(tRef.current('error.generic'));
      stopRecordingInternal();
    } finally {
      if (token === lifecycleTokenRef.current) {
        isStartingRef.current = false;
      }
    }
  }, [socketRef, userLanguage, speechEngineRegistry, soloMode, soloTargetLang, stopRecordingInternal]);

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
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast.error(tRef.current('error.offline', 'You are offline'));
        return;
      }
      startRecordingInternal();
    }
  }, [isRecording, stopRecordingInternal, startRecordingInternal]);

  return {
    isRecording,
    sttStatus,
    ttsStatus,
    toggleRecording,
    startRecording,
    stopRecording,
    stopRecordingInternal,
    stopRecordingForUnmount,
    speakText,
    refreshVoices: useCallback(async () => {
      const ttsEngine = speechEngineRegistry.getTtsEngine();
      if (ttsEngine) {
        const voices = await ttsEngine.getVoices();
        setTtsStatus(prev => ({
          ...prev,
          voicesCount: voices.length,
          voicesLoaded: voices.length > 0
        }));
      }
    }, [speechEngineRegistry]),
    setTtsStatus,
    setSttStatus
  };
}
