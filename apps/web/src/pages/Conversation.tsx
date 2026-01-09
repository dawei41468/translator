import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useRoom, useUpdateLanguage } from "@/lib/hooks";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { LANGUAGES } from "@/lib/languages";
import { useWakeLock } from "@/lib/useWakeLock";

// Local imports
import { Message, ConnectionStatus } from "./conversation/types";
import { getSocketBaseUrl } from "./conversation/utils";
import { useSpeechEngine } from "./conversation/hooks/useSpeechEngine";
import { RoomHeader } from "./conversation/components/RoomHeader";
import { MessageList } from "./conversation/components/MessageList";
import { ConversationControls } from "./conversation/components/ConversationControls";
import { DebugPanel } from "./conversation/components/DebugPanel";

const TTS_ENABLED_STORAGE_KEY = "translator_tts_enabled";

const Conversation = () => {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, speechEngineRegistry } = useAuth();
  const updateLanguageMutation = useUpdateLanguage();
  const tRef = useRef(t);

  const ownSpeakerName = useMemo(() => {
    return user?.displayName || user?.name || undefined;
  }, [user?.displayName, user?.name]);
  const ownSpeakerNameRef = useRef<string | undefined>(ownSpeakerName);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    ownSpeakerNameRef.current = ownSpeakerName;
  }, [ownSpeakerName]);

  const isTtsDebugEnabled = import.meta.env.VITE_ENABLE_TTS_DEBUG === 'true';
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [messages, setMessages] = useState<Message[]>(() => {
    if (code) {
      try {
        const saved = sessionStorage.getItem(`translator_messages_${code}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          return parsed.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
        }
      } catch {
        // ignore storage errors
      }
    }
    return [];
  });

  useEffect(() => {
    if (!ownSpeakerName) return;
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (!m.isOwn) return m;
        if (m.speakerName === ownSpeakerName) return m;
        changed = true;
        return { ...m, speakerName: ownSpeakerName };
      });
      return changed ? next : prev;
    });
  }, [ownSpeakerName]);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");

  // Keep screen awake while connected to the conversation
  useWakeLock(connectionStatus === 'connected');
  const [soloMode, setSoloMode] = useState(false);
  const soloModeRef = useRef(soloMode);
  useEffect(() => {
    soloModeRef.current = soloMode;
  }, [soloMode]);

  const [soloTargetLang, setSoloTargetLang] = useState<string>(user?.language ?? "en");
  const soloTargetLangRef = useRef(soloTargetLang);
  useEffect(() => {
    soloTargetLangRef.current = soloTargetLang;
  }, [soloTargetLang]);
  const [hasUserSelectedSoloLang, setHasUserSelectedSoloLang] = useState(false);
  const [debugPanelExpanded, setDebugPanelExpanded] = useState(false);
  const [isRoomSettingsOpen, setIsRoomSettingsOpen] = useState(false);
  
  const [audioEnabled, setAudioEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(TTS_ENABLED_STORAGE_KEY);
      if (stored === null) return false;
      return stored === "true";
    } catch {
      return false;
    }
  });

  const pushToTalkEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const coarse = typeof window.matchMedia === 'function' && (
      window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(any-pointer: coarse)').matches
    );
    const hoverNone = typeof window.matchMedia === 'function' && (
      window.matchMedia('(hover: none)').matches || window.matchMedia('(any-hover: none)').matches
    );
    return coarse && hoverNone;
  }, []);

  const {
    isRecording,
    sttStatus,
    ttsStatus,
    setTtsStatus,
    toggleRecording,
    startRecording,
    stopRecording,
    stopRecordingInternal,
    stopRecordingForUnmount,
    speakText,
    refreshVoices,
    recordingParamsRef
  } = useSpeechEngine({
    speechEngineRegistry,
    socketRef,
    userLanguage: user?.language,
    audioEnabled,
    soloMode,
    soloTargetLang,
    disableAutoStopOnSilence: pushToTalkEnabled,
  });

  const isRecordingRef = useRef(isRecording);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const sttStatusRef = useRef(sttStatus);
  useEffect(() => {
    sttStatusRef.current = sttStatus;
  }, [sttStatus]);

  const audioEnabledRef = useRef(audioEnabled);
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
    try {
      localStorage.setItem(TTS_ENABLED_STORAGE_KEY, String(audioEnabled));
    } catch {
      // ignore
    }
  }, [audioEnabled]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  // Sync soloTargetLang with user language on initial load and ensure it remains valid
  useEffect(() => {
    const availableLanguages = LANGUAGES.filter(lang => lang.code !== user?.language);
    if (!hasUserSelectedSoloLang) {
      const next = availableLanguages[0]?.code || LANGUAGES[0]?.code || "en";
      setSoloTargetLang(next);
      return;
    }

    if (!availableLanguages.some(lang => lang.code === soloTargetLang)) {
      const fallback = availableLanguages[0]?.code || LANGUAGES[0]?.code || "en";
      if (fallback && fallback !== soloTargetLang) {
        setSoloTargetLang(fallback);
      }
    }
  }, [user?.language, hasUserSelectedSoloLang, soloTargetLang]);

  // Save messages to sessionStorage
  useEffect(() => {
    if (code && messages.length > 0) {
      try {
        sessionStorage.setItem(`translator_messages_${code}`, JSON.stringify(messages));
      } catch {
        // ignore
      }
    }
  }, [messages, code]);

  const { data: roomData, isLoading, error, refetch } = useRoom(code);

  const speakTextRef = useRef(speakText);
  useEffect(() => {
    speakTextRef.current = speakText;
  }, [speakText]);

  const stopRecordingInternalRef = useRef(stopRecordingInternal);
  useEffect(() => {
    stopRecordingInternalRef.current = stopRecordingInternal;
  }, [stopRecordingInternal]);

  const stopRecordingForUnmountRef = useRef(stopRecordingForUnmount);
  useEffect(() => {
    stopRecordingForUnmountRef.current = stopRecordingForUnmount;
  }, [stopRecordingForUnmount]);

  // Initialize Socket.io
  useEffect(() => {
    if (!code) return;

    const socketUrl = getSocketBaseUrl();
    const socketInstance = io(socketUrl, {
      withCredentials: true,
      timeout: 10000,
      transports: ['websocket', 'polling'],
      forceNew: true,
    });

    const connectionTimeout = setTimeout(() => {
      if (socketInstance.connected === false) {
        setConnectionStatus('disconnected');
        toast.error('Connection timeout. The conversation server may be unavailable.');
      }
    }, 15000);

    socketInstance.on('connect', () => {
      clearTimeout(connectionTimeout);
      setConnectionStatus('connected');
      socketInstance.emit('join-room', code);
    });

    socketInstance.on('disconnect', () => setConnectionStatus('disconnected'));
    socketInstance.on('reconnect_attempt', () => setConnectionStatus('reconnecting'));
    socketInstance.on('reconnect', () => {
      setConnectionStatus('connected');

      if (isRecordingRef.current) {
        const params = recordingParamsRef.current || {
          languageCode: sttStatusRef.current.language,
          soloMode: soloModeRef.current,
          soloTargetLang: soloModeRef.current ? soloTargetLangRef.current : undefined,
        };
        socketInstance.emit('start-speech', params);
      }
    });

    socketInstance.on('connect_error', (error: any) => {
      console.error('Socket connection error:', error);
      setConnectionStatus('disconnected');
      toast.error('Unable to connect to conversation server.');
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
      setMessages((prev: Message[]) => [...prev, message]);

      if (
        audioEnabledRef.current &&
        !soloModeRef.current &&
        typeof data?.translatedText === 'string' &&
        typeof data?.originalText === 'string' &&
        data.translatedText !== data.originalText
      ) {
        speakTextRef.current(data.translatedText, data.targetLang);
      }
    });

    socketInstance.on('recognized-speech', (data: { id?: string; text: string; sourceLang: string; speakerName?: string }) => {
      const message: Message = {
        id: data.id ?? Date.now().toString(),
        text: data.text,
        isOwn: true,
        timestamp: new Date(),
        speakerName: ownSpeakerNameRef.current ?? data.speakerName,
      };
      setMessages((prev: Message[]) => [...prev, message]);
    });

    socketInstance.on('solo-translated', (data: any) => {
      setMessages((prev: Message[]) => {
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
            speakerName: ownSpeakerNameRef.current ?? data.speakerName,
          },
        ];
      });

      if (audioEnabledRef.current) {
        speakTextRef.current(data.translatedText, data.targetLang);
      }
    });

    socketInstance.on('speech-error', (error: string) => {
      toast.error(error);
      stopRecordingInternalRef.current();
    });

    socketInstance.on('error', (error: string) => toast.error(error));

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [code]); // Only recreate socket if room code changes

  // Initialize speech engines
  useEffect(() => {
    const initializeEngines = async () => {
      try {
        const ttsEngine = speechEngineRegistry.getTtsEngine();
        if (ttsEngine) {
          await ttsEngine.initialize();
          const voices = await ttsEngine.getVoices();
          setTtsStatus(prev => ({
            ...prev,
            voicesCount: voices.length,
            voicesLoaded: voices.length > 0
          }));
        }

        const sttEngine = speechEngineRegistry.getSttEngine();
        if (sttEngine) {
          // Local initialization if needed
        }
      } catch (error) {
        console.error('Failed to initialize speech engines:', error);
      }
    };

    initializeEngines();
    return () => stopRecordingForUnmountRef.current();
  }, [speechEngineRegistry]);

  const toggleAudio = async () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    
    if (next) {
      const ttsEngine = speechEngineRegistry.getTtsEngine();
      if (ttsEngine) {
        try {
          await ttsEngine.initialize();
          // Resume AudioContext on user gesture
          const voices = await ttsEngine.getVoices();
          setTtsStatus(prev => ({
            ...prev,
            voicesCount: voices.length,
            voicesLoaded: voices.length > 0
          }));
        } catch (error) {
          console.error('Failed to enable audio:', error);
        }
      }
    } else {
      const ttsEngine = speechEngineRegistry.getTtsEngine();
      if (ttsEngine) ttsEngine.stop();
    }
  };

  const handleUpdateLanguage = (value: string) => {
    updateLanguageMutation.mutate(value);
  };

  const hasOtherParticipants = !!roomData?.participants?.some((p) => p.id !== user?.id);
  const canStartRecording = soloMode || hasOtherParticipants;
  const handleToggleRecording = () => {
    if (!isRecording && !canStartRecording) {
      return;
    }
    toggleRecording();
  };

  const startRecordingGuarded = useCallback(() => {
    if (!isRecordingRef.current && !canStartRecording) {
      return;
    }
    startRecording();
  }, [canStartRecording, startRecording]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="fixed top-0 left-0 right-0 z-10 bg-background border-b p-4 sm:p-6 flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <div className="flex space-x-2">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>
        <div className="flex-1 p-4 sm:p-6 space-y-4 pt-32">
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
    <div
      className="h-full bg-background grid grid-rows-[auto_1fr_auto] gap-0 px-0 py-0 sm:px-0 sm:py-0"
      style={{ overscrollBehavior: 'none' }}
    >
      <Card className="rounded-none">
        <RoomHeader
          roomCode={roomData.code}
          connectionStatus={connectionStatus}
          audioEnabled={audioEnabled}
          toggleAudio={toggleAudio}
          onLeave={() => navigate('/dashboard')}
          userLanguage={user?.language}
          onUpdateLanguage={handleUpdateLanguage}
          isUpdatingLanguage={updateLanguageMutation.isPending}
          isSettingsOpen={isRoomSettingsOpen}
          onSettingsOpenChange={setIsRoomSettingsOpen}
          isRecording={isRecording}
          hasOtherParticipants={hasOtherParticipants}
          soloMode={soloMode}
          toggleSoloMode={() => setSoloMode((p) => !p)}
          soloTargetLang={soloTargetLang}
          onSoloLangChange={(val: string) => {
            setSoloTargetLang(val);
            setHasUserSelectedSoloLang(true);
          }}
        />

        <DebugPanel
          isTtsDebugEnabled={isTtsDebugEnabled}
          debugPanelExpanded={debugPanelExpanded}
          setDebugPanelExpanded={setDebugPanelExpanded}
          sttStatus={sttStatus}
          ttsStatus={ttsStatus}
          refreshVoices={refreshVoices}
        />
      </Card>

      <Card className="min-h-0 overflow-hidden flex flex-col rounded-none border-t-0 shadow-none">
        <MessageList messages={messages} />
      </Card>

      <Card className="rounded-none border-t-0 shadow-none">
        <ConversationControls
          isRecording={isRecording}
          toggleRecording={handleToggleRecording}
          startRecording={startRecordingGuarded}
          stopRecording={stopRecording}
          pushToTalkEnabled={pushToTalkEnabled}
          canStartRecording={canStartRecording}
          connectionStatus={connectionStatus}
          openSettings={() => setIsRoomSettingsOpen(true)}
        />
      </Card>
    </div>
  );
};

export default Conversation;