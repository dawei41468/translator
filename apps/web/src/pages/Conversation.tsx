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
  if (!base) return "http://localhost:4003";
  if (base.startsWith("http")) return base.replace(/\/api\/?$/, "");
  // Relative base URL (e.g. /api) means same origin
  if (base.startsWith("/")) return window.location.origin;
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

  // Initialize Socket.io
  useEffect(() => {
    if (!code) return;

    const socketInstance = io(getSocketBaseUrl(), {
      withCredentials: true,
    });

    socketInstance.on('connect', () => {
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

    socketInstance.on('connect_error', () => {
      setConnectionStatus('disconnected');
    });

    socketInstance.on('joined-room', (_data: any) => {
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit('stop-speech');
    }
    isRecordingRef.current = false;
    setIsRecording(false);
    flushPendingTts();
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

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="bg-background border-b p-4 sm:p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1">
            <div className={`h-2.5 w-2.5 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' :
              connectionStatus === 'connecting' ? 'bg-yellow-500' :
              connectionStatus === 'reconnecting' ? 'bg-orange-500' :
              'bg-red-500'
            }`}></div>
            <span className="text-sm font-medium">{t('room.code')}: {roomData.code}</span>
          </div>
          {connectionStatus === 'reconnecting' && (
            <span className="text-sm text-muted-foreground">{t('conversation.reconnecting')}...</span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant={audioEnabled ? "default" : "outline"}
            onClick={toggleAudio}
            title={audioEnabled ? t('conversation.audioOn') : t('conversation.audioOff')}
            size="icon"
          >
            {audioEnabled ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button
            type="button"
            variant={allowSpeakerAudio ? "secondary" : "outline"}
            onClick={toggleSpeakerOverride}
            title={t('conversation.allowSpeakerAudio', 'Allow speaker audio')}
            size="icon"
          >
            <Speaker />
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/dashboard')}
          >
            <LogOut />
            {t('common.leave')}
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
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
                >
                  {message.translatedText}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-background border-t p-4 pb-8 sm:p-6">
        <div className="mb-4 flex flex-col items-center gap-3">
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              variant={soloMode ? "default" : "outline"}
              size="sm"
              onClick={toggleSoloMode}
            >
              {t('conversation.soloMode')}
            </Button>
            {soloMode && (
              <Select value={soloTargetLang} onValueChange={setSoloTargetLang}>
                <SelectTrigger className="h-9 w-44">
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
            )}
          </div>
          {soloMode && (
            <p className="text-center text-xs text-muted-foreground">
              {t('conversation.soloModeHint')}
            </p>
          )}
        </div>
        <div className="flex justify-center">
          <Button
            type="button"
            onClick={toggleRecording}
            disabled={connectionStatus !== 'connected'}
            variant={isRecording ? "destructive" : "default"}
            size="lg"
            className={cn(
              "h-16 w-16 rounded-full shadow-lg transition-all",
              isRecording ? "animate-pulse scale-110" : "hover:scale-105"
            )}
          >
            {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-3">
          {isRecording ? t('conversation.stopSpeaking') : t('conversation.startSpeaking')}
        </p>
      </div>
    </div>
  );
};

export default Conversation;