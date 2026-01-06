import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useRoom, useMe } from "@/lib/hooks";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, LogOut, Mic, MicOff, Speaker } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGUAGES } from "@/lib/languages";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Message {
  id: string;
  text: string;
  translatedText?: string;
  isOwn: boolean;
  timestamp: Date;
}

const TTS_ENABLED_STORAGE_KEY = "translator_tts_enabled";
const TTS_SPEAKER_OVERRIDE_STORAGE_KEY = "translator_tts_speaker_override";

function getTtsLocale(language: string | null | undefined): string {
  switch ((language ?? "en").toLowerCase()) {
    case "zh":
      return "zh-CN";
    case "it":
      return "it-IT";
    case "de":
      return "de-DE";
    case "nl":
      return "nl-NL";
    case "en":
    default:
      return "en-US";
  }
}

function getSocketBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";

  console.log('getSocketBaseUrl debug:', {
    base,
    host,
    isLocalHost,
    origin: window.location.origin
  });

  if (!base) {
    // In local dev, the API/socket server runs on :4003. In prod, default to same-origin.
    const result = isLocalHost ? "http://localhost:4003" : window.location.origin;
    console.log('No base URL, returning:', result);
    return result;
  }
  if (base.startsWith("http")) {
    const normalized = base.replace(/\/api\/?$/, "");
    // Never allow production clients to attempt sockets on their own localhost.
    if (!isLocalHost && /^(https?:\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/.test(normalized)) {
      console.log('Production client trying to connect to localhost, using origin:', window.location.origin);
      return window.location.origin;
    }
    console.log('Using normalized base URL:', normalized);
    return normalized;
  }
  // Relative base URL (e.g. /api) means same origin
  if (base.startsWith("/")) {
    console.log('Relative base URL, using origin:', window.location.origin);
    return window.location.origin;
  }
  const result = "http://localhost:4003";
  console.log('Fallback to localhost:', result);
  return result;
}

function getSpeechRecognitionLocale(language: string | null | undefined): string {
  switch ((language ?? "en").toLowerCase()) {
    case "zh":
      return "zh-CN";
    case "it":
      return "it-IT";
    case "de":
      return "de-DE";
    case "nl":
      return "nl-NL";
    case "en":
    default:
      return "en-US";
  }
}

const Conversation = () => {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: meData } = useMe();
  const [socket, setSocket] = useState<Socket | null>(null);

  // Debug logging
  console.log('🚀 Conversation component MOUNTED', { code, user: !!user, meData: !!meData, timestamp: new Date().toISOString() });
  const socketRef = useRef<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "reconnecting"
  >("connecting");
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [soloMode, setSoloMode] = useState(false);
  const [soloTargetLang, setSoloTargetLang] = useState<string>(() => {
    return user?.language ?? "en";
  });
  const [audioEnabled, setAudioEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(TTS_ENABLED_STORAGE_KEY);
      if (stored === null) return true;
      return stored === "true";
    } catch {
      return true;
    }
  });
  const [allowSpeakerAudio, setAllowSpeakerAudio] = useState(() => {
    try {
      const stored = localStorage.getItem(TTS_SPEAKER_OVERRIDE_STORAGE_KEY);
      if (stored === null) return false;
      return stored === "true";
    } catch {
      return false;
    }
  });
  const [hasPrivateAudioOutput, setHasPrivateAudioOutput] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const pendingTtsRef = useRef<{ text: string; language: string | null | undefined } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioEnabledRef = useRef<boolean>(audioEnabled);
  const hasPrivateAudioOutputRef = useRef<boolean>(hasPrivateAudioOutput);
  const allowSpeakerAudioRef = useRef<boolean>(allowSpeakerAudio);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    hasPrivateAudioOutputRef.current = hasPrivateAudioOutput;
  }, [hasPrivateAudioOutput]);

  useEffect(() => {
    allowSpeakerAudioRef.current = allowSpeakerAudio;
  }, [allowSpeakerAudio]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const speakTextNow = (text: string, language: string | null | undefined) => {
    if (!audioEnabledRef.current) return;
    // Real-world default: only speak when using a private audio output (headphones/earbuds).
    if (!hasPrivateAudioOutputRef.current && !allowSpeakerAudioRef.current) return;
    const synth = synthRef.current;
    if (!synth) return;

    const locale = getTtsLocale(language);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;

    const voices =
      voicesRef.current.length > 0 ? voicesRef.current : synth.getVoices();

    const localeLower = locale.toLowerCase();
    const primary = localeLower.split("-")[0];

    const voice =
      voices.find((v) => v.lang.toLowerCase() === localeLower) ??
      voices.find((v) => v.lang.toLowerCase().startsWith(`${primary}-`)) ??
      voices.find((v) => v.lang.toLowerCase() === primary);

    if (voice) utterance.voice = voice;

    synth.cancel();
    synth.speak(utterance);
  };

  const speakText = (text: string, language: string | null | undefined) => {
    // Avoid audio feedback loops: don't speak while mic is recording.
    if (isRecordingRef.current) {
      pendingTtsRef.current = { text, language };
      return;
    }
    speakTextNow(text, language);
  };

  const flushPendingTts = () => {
    const pending = pendingTtsRef.current;
    if (!pending) return;
    pendingTtsRef.current = null;
    speakTextNow(pending.text, pending.language);
  };

  const refreshAudioOutputs = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === "audiooutput");

      // If the platform doesn't expose output devices, we can't reliably detect.
      // Keep default false (text-only).
      if (outputs.length === 0) {
        setHasPrivateAudioOutput(false);
        return;
      }

      const isPrivate = outputs.some((d) => {
        const label = (d.label ?? "").toLowerCase();
        return (
          label.includes("headphone") ||
          label.includes("headset") ||
          label.includes("earbud") ||
          label.includes("airpod") ||
          label.includes("buds")
        );
      });

      setHasPrivateAudioOutput(isPrivate);
    } catch {
      setHasPrivateAudioOutput(false);
    }
  };

  useEffect(() => {
    const next = meData?.user?.language ?? user?.language;
    if (next) setSoloTargetLang(next);
  }, [meData?.user?.language, user?.language]);

  // Get room info
  const { data: roomData, isLoading, error, refetch } = useRoom(code);

  console.log('Room data state:', { roomData, isLoading, error, code });
  console.log('User data state:', { user, meData });

  // Initialize Socket.io
  useEffect(() => {
    if (!code) return;

    console.log('Initializing socket connection for room:', code);
    const socketUrl = getSocketBaseUrl();
    console.log('Connecting to socket URL:', socketUrl);

    console.log('Creating Socket.IO instance with URL:', socketUrl);
    const socketInstance = io(socketUrl, {
      withCredentials: true,
      timeout: 10000, // 10 second connection timeout
      transports: ['websocket', 'polling'], // Try WebSocket first, fallback to polling
      forceNew: true, // Force new connection
    });
    console.log('Socket.IO instance created:', socketInstance);

    // Set a timeout for connection
    const connectionTimeout = setTimeout(() => {
      if (socketInstance.connected === false) {
        console.error('Socket connection timeout');
        setConnectionStatus('disconnected');
        toast.error('Connection timeout. The conversation server may be unavailable.');
      }
    }, 15000); // 15 seconds

    socketInstance.on('connect', () => {
      clearTimeout(connectionTimeout);
      console.log('Socket connected, joining room:', code);
      setConnectionStatus('connected');
      // Join the room
      socketInstance.emit('join-room', code);
    });

    socketInstance.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socketInstance.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    socketInstance.on('reconnect', () => {
      setConnectionStatus('connected');
      toast.success(t('conversation.reconnected'));
    });

    socketInstance.on('connect_error', (error: any) => {
      console.error('Socket connection error:', error);
      setConnectionStatus('disconnected');
      toast.error('Unable to connect to conversation server. Please check your internet connection.');
    });

    socketInstance.on('joined-room', (_data: any) => {
      console.log('Successfully joined room via socket');
      toast.success(t('conversation.connectedToast'));
    });

    socketInstance.on('user-joined', (_data: any) => {
      toast.info(t('conversation.userJoined'));
    });

    socketInstance.on('user-left', (_data: any) => {
      toast.info(t('conversation.userLeft'));
    });

    socketInstance.on('user-reconnected', (_data: any) => {
      toast.success(t('conversation.userReconnected'));
    });

    socketInstance.on('translated-message', (data: any) => {
      const message: Message = {
        id: Date.now().toString(),
        text: data.originalText,
        translatedText: data.translatedText,
        isOwn: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, message]);

      // Speak the translated text if audio is enabled
      if (audioEnabledRef.current && synthRef.current) {
        speakText(data.translatedText, data.targetLang);
      }
    });

    socketInstance.on('recognized-speech', (data: { id?: string; text: string; sourceLang: string }) => {
      const message: Message = {
        id: data.id ?? Date.now().toString(),
        text: data.text,
        isOwn: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, message]);
    });

    socketInstance.on(
      'solo-translated',
      (data: { id: string; originalText: string; translatedText: string; sourceLang: string; targetLang: string }) => {
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === data.id);
          if (existing) {
            return prev.map((m) => (m.id === data.id ? { ...m, translatedText: data.translatedText } : m));
          }

          return [
            ...prev,
            {
              id: data.id,
              text: data.originalText,
              translatedText: data.translatedText,
              isOwn: true,
              timestamp: new Date(),
            },
          ];
        });

        if (audioEnabledRef.current && synthRef.current) {
          speakText(data.translatedText, data.targetLang);
        }
      }
    );

    socketInstance.on('speech-error', (error: string) => {
      toast.error(error);
      pendingTtsRef.current = null;
      stopRecordingInternal();
    });

    socketInstance.on('error', (error: string) => {
      toast.error(error);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [code, t]);

  useEffect(() => {
    try {
      localStorage.setItem(TTS_ENABLED_STORAGE_KEY, String(audioEnabled));
    } catch {
      // ignore
    }
  }, [audioEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(
        TTS_SPEAKER_OVERRIDE_STORAGE_KEY,
        String(allowSpeakerAudio)
      );
    } catch {
      // ignore
    }
  }, [allowSpeakerAudio]);

  // Initialize speech synthesis and cleanup audio on unmount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      synthRef.current = synth;

      const syncVoices = () => {
        voicesRef.current = synth.getVoices();
      };

      syncVoices();
      synth.addEventListener("voiceschanged", syncVoices);

      return () => {
        synth.removeEventListener("voiceschanged", syncVoices);
        stopRecordingInternal();
      };
    }
    return () => {
      stopRecordingInternal();
    };
  }, []);

  useEffect(() => {
    refreshAudioOutputs();

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;

    mediaDevices.addEventListener("devicechange", refreshAudioOutputs);
    return () => {
      mediaDevices.removeEventListener("devicechange", refreshAudioOutputs);
    };
  }, []);

  const stopRecordingInternal = () => {
    try {
      // Stop media recorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        // Clear event listeners to prevent memory leaks
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.onerror = null;
        mediaRecorderRef.current.ondataavailable = null;
      }
      mediaRecorderRef.current = null;

      // Stop all media tracks and clear stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          // Remove all track event listeners
          track.onended = null;
          track.onmute = null;
          track.onunmute = null;
        });
        streamRef.current = null;
      }

      // Notify server to stop recognition
      if (socketRef.current) {
        socketRef.current.emit('stop-speech');
      }

      // Reset recording state
      isRecordingRef.current = false;
      setIsRecording(false);

      // Flush any pending TTS
      flushPendingTts();
    } catch (error) {
      console.error('Error during audio cleanup:', error);
      // Force reset state even if cleanup fails
      mediaRecorderRef.current = null;
      streamRef.current = null;
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  };

  const startRecordingInternal = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // After mic permission is granted, device labels become available in many browsers.
      await refreshAudioOutputs();

      const activeSocket = socketRef.current;
      if (!activeSocket) return;

      const languageCode = getSpeechRecognitionLocale(meData?.user?.language ?? user?.language ?? "en");
      activeSocket.emit('start-speech', {
        languageCode,
        soloMode,
        soloTargetLang: soloMode ? soloTargetLang : undefined,
      });

      // Use MediaRecorder to capture audio and send chunks
      // Check for supported mime types
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && activeSocket.connected) {
          activeSocket.emit('speech-data', event.data);
        }
      };

      mediaRecorder.start(250); // Send data every 250ms
      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
      toast.error(t('error.generic'));
      stopRecordingInternal();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecordingInternal();
    } else {
      startRecordingInternal();
    }
  };

  const toggleSoloMode = () => {
    if (isRecording) {
      stopRecordingInternal();
    }
    setSoloMode((prev) => !prev);
  };

  const toggleAudio = () => {
    setAudioEnabled((prev) => {
      const next = !prev;
      if (!next && synthRef.current) {
        synthRef.current.cancel();
      }
      return next;
    });
  };

  const toggleSpeakerOverride = () => {
    setAllowSpeakerAudio((prev) => !prev);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="bg-background border-b p-4 sm:p-6 flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <div className="flex space-x-2">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>
        <div className="flex-1 p-4 sm:p-6 space-y-4">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-12 w-1/2 ml-auto" />
          <Skeleton className="h-12 w-2/3" />
        </div>
      </div>
    );
  }

  if (error || !roomData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ErrorState 
          message={error?.message || t('error.roomNotFound')} 
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  try {
    // Temporary debug info
    const debugInfo = {
      code,
      roomData: !!roomData,
      isLoading,
      error: error ? String(error) : null,
      connectionStatus,
      user: !!user,
      meData: !!meData
    };

    return (
      <div className="flex flex-col h-screen bg-background">
        {/* Debug overlay - remove in production */}
        <div className="fixed top-0 left-0 bg-black text-white text-xs p-2 z-50 max-w-md">
          DEBUG: {JSON.stringify(debugInfo, null, 2)}
        </div>
        {/* Header */}
        <header className="bg-background border-b p-4 sm:p-6 flex items-center justify-between" role="banner">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1" role="status" aria-label={t('conversation.connectionStatus')}>
              <div className={`h-2.5 w-2.5 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' :
                connectionStatus === 'connecting' ? 'bg-yellow-500' :
                connectionStatus === 'reconnecting' ? 'bg-orange-500' :
                'bg-red-500'
              }`} aria-hidden="true"></div>
              <span className="text-sm font-medium">{t('room.code')}: {roomData.code}</span>
            </div>
            {connectionStatus === 'reconnecting' && (
              <span className="text-sm text-muted-foreground" aria-live="polite">{t('conversation.reconnecting')}...</span>
            )}
          </div>
          <div className="flex items-center space-x-2" role="toolbar" aria-label={t('conversation.controls')}>
            <Button
              type="button"
              variant={audioEnabled ? "default" : "outline"}
              onClick={toggleAudio}
              aria-label={audioEnabled ? t('conversation.audioOn') : t('conversation.audioOff')}
              aria-pressed={audioEnabled}
              size="icon"
              aria-describedby="audio-description"
            >
              {audioEnabled ? <Volume2 /> : <VolumeX />}
            </Button>
            <span id="audio-description" className="sr-only">
              {audioEnabled ? t('conversation.audioEnabledDesc') : t('conversation.audioDisabledDesc')}
            </span>
            <Button
              type="button"
              variant={allowSpeakerAudio ? "secondary" : "outline"}
              onClick={toggleSpeakerOverride}
              aria-label={t('conversation.allowSpeakerAudio', 'Allow speaker audio')}
              aria-pressed={allowSpeakerAudio}
              size="icon"
              aria-describedby="speaker-description"
            >
              <Speaker />
            </Button>
            <span id="speaker-description" className="sr-only">
              {allowSpeakerAudio ? t('conversation.speakerAllowedDesc') : t('conversation.speakerNotAllowedDesc')}
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/dashboard')}
              aria-label={t('common.leave')}
              aria-describedby="leave-description"
            >
              <LogOut />
              {t('common.leave')}
            </Button>
            <span id="leave-description" className="sr-only">{t('conversation.leaveRoomDesc')}</span>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4" role="log" aria-live="polite" aria-label={t('conversation.messages')} aria-atomic="false">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
              role="article"
              aria-label={`${message.isOwn ? t('conversation.yourMessage') : t('conversation.otherMessage')} ${new Date(message.timestamp).toLocaleTimeString()}`}
            >
              <div
                className={cn(
                  "max-w-[85%] sm:max-w-sm lg:max-w-md px-4 py-2 shadow-sm",
                  message.isOwn
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-none"
                    : "bg-card text-card-foreground border rounded-2xl rounded-tl-none"
                )}
              >
                <p className="leading-relaxed">{message.text}</p>
                {message.translatedText && (
                  <p
                    className={cn(
                      "text-sm mt-1.5 border-t pt-1",
                      message.isOwn
                        ? "text-primary-foreground/80 border-primary-foreground/20"
                        : "text-muted-foreground border-border/50"
                    )}
                    aria-label={`${t('conversation.translation')}: ${message.translatedText}`}
                  >
                    {message.translatedText}
                  </p>
                )}
                <time className="sr-only" dateTime={message.timestamp.toISOString()}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </time>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} aria-hidden="true" />
        </main>

        <footer className="bg-background border-t p-4 pb-8 sm:p-6" role="contentinfo">
          <div className="mb-4 flex flex-col items-center gap-3">
            <div className="flex items-center justify-center gap-3" role="group" aria-label={t('conversation.modeControls')}>
              <Button
                type="button"
                variant={soloMode ? "default" : "outline"}
                size="sm"
                onClick={toggleSoloMode}
                aria-pressed={soloMode}
                aria-label={t('conversation.soloMode')}
                aria-describedby="solo-mode-description"
              >
                {t('conversation.soloMode')}
              </Button>
              {soloMode && (
                <div>
                  <label htmlFor="solo-language-select" className="sr-only">{t('conversation.translateTo')}</label>
                  <Select value={soloTargetLang} onValueChange={setSoloTargetLang}>
                    <SelectTrigger id="solo-language-select" className="h-9 w-44" aria-label={t('conversation.translateTo')}>
                      <SelectValue placeholder={t('conversation.translateTo')} />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name} ({lang.code.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {soloMode && (
              <p className="text-center text-xs text-muted-foreground" id="solo-mode-description" role="note">
                {t('conversation.soloModeHint')}
              </p>
            )}
          </div>
          <div className="flex justify-center">
            <Button
              type="button"
              onClick={toggleRecording}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleRecording();
                }
              }}
              disabled={connectionStatus !== 'connected'}
              variant={isRecording ? "destructive" : "default"}
              size="lg"
              className={cn(
                "h-16 w-16 rounded-full shadow-lg transition-all focus:ring-4 focus:ring-primary/20",
                isRecording ? "animate-pulse scale-110" : "hover:scale-105"
              )}
              aria-pressed={isRecording}
              aria-label={isRecording ? t('conversation.stopSpeaking') : t('conversation.startSpeaking')}
              aria-describedby="recording-status"
            >
              {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3" aria-live="polite" role="status" id="recording-status">
            {isRecording ? t('conversation.recordingActive') : t('conversation.tapToSpeak')}
          </p>
        </footer>
      </div>
    );
  } catch (error) {
    console.error('Error rendering Conversation component:', error);
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold mb-4">Something went wrong</h2>
          <p className="text-muted-foreground mb-4">Unable to load the conversation. Please try refreshing the page.</p>
          <Button onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }
};

export default Conversation;