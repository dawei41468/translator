import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useRoom, useMe, useUpdateLanguage } from "@/lib/hooks";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Mic, MicOff } from "lucide-react";
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
  speakerName?: string;
}

const TTS_ENABLED_STORAGE_KEY = "translator_tts_enabled";

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

  if (!base) {
    // In local dev, the API/socket server runs on :4003. In prod, default to same-origin.
    return isLocalHost ? "http://localhost:4003" : window.location.origin;
  }
  if (base.startsWith("http")) {
    const normalized = base.replace(/\/api\/?$/, "");
    // Never allow production clients to attempt sockets on their own localhost.
    if (!isLocalHost && /^(https?:\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/.test(normalized)) {
      return window.location.origin;
    }
    return normalized;
  }
  // Relative base URL (e.g. /api) means same origin
  if (base.startsWith("/")) {
    return window.location.origin;
  }
  return "http://localhost:4003";
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
  const updateLanguageMutation = useUpdateLanguage();
  const [socket, setSocket] = useState<Socket | null>(null);

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
      if (stored === null) return false; // Default to OFF for text-only mode
      return stored === "true";
    } catch {
      return false;
    }
  });
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const pendingTtsRef = useRef<{ text: string; language: string | null | undefined } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioEnabledRef = useRef<boolean>(audioEnabled);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const speakTextNow = (text: string, language: string | null | undefined) => {
    if (!audioEnabledRef.current) {
      console.log('TTS: Audio disabled, skipping speech');
      return;
    }
    const synth = synthRef.current;
    if (!synth) {
      console.error('TTS: SpeechSynthesis not available');
      toast.error(t('conversation.ttsNotSupported'));
      return;
    }

    const locale = getTtsLocale(language);
    console.log('TTS: Attempting to speak text:', text.substring(0, 50) + '...', 'in locale:', locale);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;

    // Add error handling
    utterance.onerror = (event) => {
      console.error('TTS: Speech synthesis error:', event.error, event);
      toast.error(t('conversation.ttsError', 'Speech synthesis failed. Check device permissions.'));
    };

    utterance.onstart = () => {
      console.log('TTS: Speech started successfully');
    };

    utterance.onend = () => {
      console.log('TTS: Speech completed');
    };

    const voices =
      voicesRef.current.length > 0 ? voicesRef.current : synth.getVoices();

    console.log('TTS: Available voices:', voices.length, voices.map(v => `${v.name} (${v.lang})`));

    const localeLower = locale.toLowerCase();
    const primary = localeLower.split("-")[0];

    const voice =
      voices.find((v) => v.lang.toLowerCase() === localeLower) ??
      voices.find((v) => v.lang.toLowerCase().startsWith(`${primary}-`)) ??
      voices.find((v) => v.lang.toLowerCase() === primary);

    if (voice) {
      utterance.voice = voice;
      console.log('TTS: Using voice:', voice.name, '(', voice.lang, ')');
    } else {
      console.warn('TTS: No suitable voice found for locale:', locale);
    }

    try {
      synth.cancel(); // Cancel any ongoing speech
      synth.speak(utterance);
      console.log('TTS: Speech synthesis initiated');
    } catch (error) {
      console.error('TTS: Failed to initiate speech synthesis:', error);
      toast.error(t('conversation.ttsError', 'Speech synthesis failed. Check device permissions.'));
    }
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


  useEffect(() => {
    const next = meData?.user?.language ?? user?.language;
    if (next && next !== soloTargetLang) {
      setSoloTargetLang(next);
    }
  }, [meData?.user?.language, user?.language, soloTargetLang]);

  // Get room info
  const { data: roomData, isLoading, error, refetch } = useRoom(code);

  // Initialize Socket.io
  useEffect(() => {
    if (!code) return;

    const socketUrl = getSocketBaseUrl();
    const socketInstance = io(socketUrl, {
      withCredentials: true,
      timeout: 10000, // 10 second connection timeout
      transports: ['websocket', 'polling'], // Try WebSocket first, fallback to polling
      forceNew: true, // Force new connection
    });

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
        speakerName: data.speakerName,
      };
      setMessages(prev => [...prev, message]);

      // Speak the translated text if audio is enabled
      if (audioEnabledRef.current && synthRef.current) {
        speakText(data.translatedText, data.targetLang);
      }
    });

    socketInstance.on('recognized-speech', (data: { id?: string; text: string; sourceLang: string; speakerName?: string }) => {
      const message: Message = {
        id: data.id ?? Date.now().toString(),
        text: data.text,
        isOwn: true,
        timestamp: new Date(),
        speakerName: data.speakerName,
      };
      setMessages(prev => [...prev, message]);
    });

    socketInstance.on(
      'solo-translated',
      (data: { id: string; originalText: string; translatedText: string; sourceLang: string; targetLang: string; speakerName?: string }) => {
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
              speakerName: data.speakerName,
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
  }, [code]);

  useEffect(() => {
    try {
      localStorage.setItem(TTS_ENABLED_STORAGE_KEY, String(audioEnabled));
    } catch {
      // ignore
    }
  }, [audioEnabled]);


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


  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-background overflow-hidden">
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
    return (
      <div className="flex flex-col h-screen bg-background overflow-hidden">
        {/* Header */}
        <header className="bg-background border-b p-4 sm:p-6" role="banner">
          {/* First Row: Room status and controls */}
          <div className="flex items-center justify-between mb-3">
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
                variant="secondary"
                onClick={() => navigate('/dashboard')}
                aria-label={t('common.leave')}
                aria-describedby="leave-description"
              >
                {t('common.leave')}
              </Button>
              <span id="leave-description" className="sr-only">{t('conversation.leaveRoomDesc')}</span>
            </div>
          </div>

          {/* Second Row: Language selector and description */}
          <div className="flex items-center justify-between">
            <Select
              value={meData?.user?.language || ""}
              onValueChange={(value) => updateLanguageMutation.mutate(value)}
              disabled={updateLanguageMutation.isPending}
            >
              <SelectTrigger className="h-9 w-44" aria-label={t('settings.language.title')}>
                <SelectValue placeholder={t('conversation.translateTo')} />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground max-w-xs ml-4">
              {t('conversation.languageDescription', 'Select your language for speech recognition and translations')}
            </p>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4" role="log" aria-live="polite" aria-label={t('conversation.messages')} aria-atomic="false">
          {messages.map((message, index) => {
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const showSpeakerName = !prevMessage || prevMessage.speakerName !== message.speakerName;

            return (
              <div
                key={message.id}
                className={`flex flex-col ${message.isOwn ? 'items-end' : 'items-start'}`}
                role="article"
                aria-label={`${message.isOwn ? t('conversation.yourMessage') : t('conversation.otherMessage')} ${new Date(message.timestamp).toLocaleTimeString()}`}
              >
                {showSpeakerName && message.speakerName && (
                  <div className={`text-xs text-muted-foreground mb-1 px-2 ${message.isOwn ? 'text-right' : 'text-left'}`}>
                    {message.speakerName}
                  </div>
                )}
                <div className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}>
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
                        {/* Translated text - MOST PROMINENT */}
                        <p className="text-base font-medium leading-relaxed">
                          {message.translatedText}
                        </p>
                        {/* Original text - de-emphasized */}
                        <p
                          className={cn(
                            "text-xs mt-2 border-t pt-2 italic",
                            message.isOwn
                              ? "text-primary-foreground/70 border-primary-foreground/20"
                              : "text-muted-foreground border-border/50"
                          )}
                        >
                          <span className="sr-only">{t('conversation.originalText', 'Original')}: </span>
                          {message.text}
                        </p>
                      </>
                    ) : (
                      <p className="leading-relaxed">{message.text}</p>
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
                          {lang.name}
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