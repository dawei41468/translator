import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useRoom } from "@/lib/hooks";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useAuth } from "@/lib/auth";
import { useMe } from "@/lib/hooks";

interface Message {
  id: string;
  text: string;
  translatedText?: string;
  isOwn: boolean;
  timestamp: Date;
}

const TTS_ENABLED_STORAGE_KEY = "translator_tts_enabled";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('connecting');
  const [isRecording, setIsRecording] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(TTS_ENABLED_STORAGE_KEY);
      if (stored === null) return true;
      return stored === "true";
    } catch {
      return true;
    }
  });
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioEnabledRef = useRef<boolean>(audioEnabled);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

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
        const utterance = new SpeechSynthesisUtterance(data.translatedText);
        synthRef.current.speak(utterance);
      }
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

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = getSpeechRecognitionLocale(meData?.user?.language ?? user?.language ?? "en");

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript && socket) {
          // Send to server for translation
          socket.emit('speech-transcript', {
            transcript: finalTranscript,
            sourceLang: recognition.lang.split('-')[0],
          });

          // Add own message
          const message: Message = {
            id: Date.now().toString(),
            text: finalTranscript,
            isOwn: true,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, message]);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }

    // Initialize speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, [socket, roomData, user?.language, meData?.user?.language]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast.error(t('error.speechNotSupported'));
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
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
      <div className="flex flex-col h-screen bg-gray-50">
        <div className="bg-white border-b p-4 sm:p-6 flex items-center justify-between">
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
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4 sm:p-6 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-500' :
            connectionStatus === 'connecting' ? 'bg-yellow-500' :
            connectionStatus === 'reconnecting' ? 'bg-orange-500' :
            'bg-red-500'
          }`}></div>
          <span className="font-medium">{t('room.code')}: {roomData.code}</span>
          {connectionStatus === 'reconnecting' && <span className="text-sm text-orange-600">{t('conversation.reconnecting')}...</span>}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleAudio}
            className={`p-2 rounded ${audioEnabled ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            title={audioEnabled ? t('conversation.audioOn') : t('conversation.audioOff')}
          >
            🔊
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-3 py-1 bg-gray-500 text-white rounded"
          >
            {t('common.leave')}
          </button>
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
              className={`max-w-xs sm:max-w-sm lg:max-w-md px-4 py-2 rounded-lg ${
                message.isOwn
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border'
              }`}
            >
              <p>{message.text}</p>
              {message.translatedText && !message.isOwn && (
                <p className="text-sm opacity-75 mt-1">{message.translatedText}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Controls */}
      <div className="bg-white border-t p-4 sm:p-6">
        <div className="flex justify-center">
          <button
            onClick={toggleRecording}
            disabled={connectionStatus !== 'connected'}
            className={`px-6 py-3 sm:px-8 sm:py-4 rounded-full font-medium ${
              isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-green-500 text-white hover:bg-green-600'
            } disabled:opacity-50`}
          >
            {isRecording ? t('conversation.stopSpeaking') : t('conversation.startSpeaking')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Conversation;