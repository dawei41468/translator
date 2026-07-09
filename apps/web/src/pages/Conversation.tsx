import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useRoom, useUpdateLanguage } from "@/lib/hooks";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useWakeLock } from "@/lib/useWakeLock";
import { useS2SAudioPlayer } from "@/lib/audio-worklet/useS2SAudioPlayer";

// Local imports
import { Message, ConnectionStatus } from "./conversation/types";
import { getSocketBaseUrl } from "./conversation/utils";
import { useSpeechEngine } from "./conversation/hooks/useSpeechEngine";
import { RoomHeader } from "./conversation/components/RoomHeader";
import { MessageList } from "./conversation/components/MessageList";
import { ConversationControls } from "./conversation/components/ConversationControls";
import { DebugPanel } from "./conversation/components/DebugPanel";
import { ParticipantStatus } from "@/components/StatusIndicator";

const AUDIO_ENABLED_STORAGE_KEY = "translator_audio_enabled";

const Conversation = () => {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const updateLanguageMutation = useUpdateLanguage();
  const tRef = useRef(t);

  const ownSpeakerName = user?.displayName || user?.name || undefined;
  const ownSpeakerNameRef = useRef<string | undefined>(ownSpeakerName);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    ownSpeakerNameRef.current = ownSpeakerName;
  }, [ownSpeakerName]);

  const isDebugEnabled = import.meta.env.VITE_ENABLE_TTS_DEBUG === 'true';
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [messages, setMessages] = useState<Message[]>(() => {
    if (!code) return [];
    try {
      const stored = sessionStorage.getItem(`translator_messages_${code}`);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((m: Message) => ({
        ...m,
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
      }));
    } catch {
      return [];
    }
  });

  const [participantStatuses, setParticipantStatuses] = useState<Map<string, {
    status: ParticipantStatus;
    lastSeen: Date;
    backgroundedAt?: Date;
  }>>(new Map());

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

  const [debugPanelExpanded, setDebugPanelExpanded] = useState(false);
  const [isRoomSettingsOpen, setIsRoomSettingsOpen] = useState(false);

  const [audioEnabled, setAudioEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(AUDIO_ENABLED_STORAGE_KEY);
      if (stored === null) return false;
      return stored === "true";
    } catch {
      return false;
    }
  });

  const pushToTalkEnabled = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && (
    window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(any-pointer: coarse)').matches
  ) && (
    window.matchMedia('(hover: none)').matches || window.matchMedia('(any-hover: none)').matches
  );

  const {
    isRecording,
    status: s2sStatus,
    toggleRecording,
    startRecording,
    stopRecording,
    stopRecordingInternal,
    stopRecordingForUnmount,
  } = useSpeechEngine({
    socketRef,
    userLanguage: user?.language,
    disableAutoStopOnSilence: pushToTalkEnabled,
  });

  const isRecordingRef = useRef(isRecording);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const audioEnabledRef = useRef(audioEnabled);
  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
    try {
      localStorage.setItem(AUDIO_ENABLED_STORAGE_KEY, String(audioEnabled));
    } catch {
      // ignore
    }
  }, [audioEnabled]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  // S2S audio player for cross-language utterance playback.
  const s2sAudioPlayer = useS2SAudioPlayer(24000);

  useEffect(() => {
    s2sAudioPlayer.onPlaybackEmpty(() => {
      // Playback finished; UI is driven by utterance-done so nothing needed here.
    });
    s2sAudioPlayer.onError((message) => {
      toast.error(message);
    });
    return () => {
      s2sAudioPlayer.onPlaybackEmpty(null);
      s2sAudioPlayer.onError(null);
    };
  }, [s2sAudioPlayer]);

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

  const stopRecordingInternalRef = useRef(stopRecordingInternal);
  useEffect(() => {
    stopRecordingInternalRef.current = stopRecordingInternal;
  }, [stopRecordingInternal]);

  const stopRecordingForUnmountRef = useRef(stopRecordingForUnmount);
  useEffect(() => {
    stopRecordingForUnmountRef.current = stopRecordingForUnmount;
  }, [stopRecordingForUnmount]);

  // Initialize participant statuses from room data
  useEffect(() => {
    if (roomData?.participantStatuses) {
      setParticipantStatuses(roomData.participantStatuses);
    }
  }, [roomData?.participantStatuses]);

  // Keep a stable invalidate helper for socket presence events
  const invalidateRoomRef = useRef(() => {
    if (code) {
      void queryClient.invalidateQueries({ queryKey: ["room", code] });
    }
  });
  useEffect(() => {
    invalidateRoomRef.current = () => {
      if (code) {
        void queryClient.invalidateQueries({ queryKey: ["room", code] });
      }
    };
  }, [code, queryClient]);

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

    const joinRoom = () => {
      socketInstance.emit('join-room', code);
    };

    const connectionTimeout = setTimeout(() => {
      if (socketInstance.connected === false) {
        setConnectionStatus('disconnected');
        toast.error('Connection timeout. The conversation server may be unavailable.');
      }
    }, 15000);

    socketInstance.on('connect', () => {
      clearTimeout(connectionTimeout);
      setConnectionStatus('connected');
      joinRoom();
    });

    socketInstance.on('disconnect', () => setConnectionStatus('disconnected'));
    socketInstance.on('reconnect_attempt', () => setConnectionStatus('reconnecting'));
    socketInstance.on('reconnect', () => {
      setConnectionStatus('connected');
      // Socket.IO may not re-run join side effects; re-join the room after reconnect.
      joinRoom();
      invalidateRoomRef.current();

      if (isRecordingRef.current) {
        // Reconnecting mid-utterance is not automatically resumed; client stops the
        // local recorder and the user can restart speaking. This avoids mismatched
        // utterance state between client and server.
        stopRecordingInternalRef.current();
      }
    });

    socketInstance.on('connect_error', (_error: any) => {
      setConnectionStatus('disconnected');
      toast.error('Unable to connect to conversation server.');
    });

    socketInstance.on('joined-room', () => {
      invalidateRoomRef.current();
    });

    socketInstance.on('user-joined', () => {
      invalidateRoomRef.current();
    });

    socketInstance.on('user-left', () => {
      invalidateRoomRef.current();
    });

    socketInstance.on('utterance-started', (data: { utteranceId: string; speakerId: string; sourceLang: string }) => {
      const isOwn = data.speakerId === user?.id;
      const newMessage: Message = {
        id: data.utteranceId,
        utteranceId: data.utteranceId,
        text: "",
        isOwn,
        timestamp: new Date(),
        speakerName: isOwn ? ownSpeakerNameRef.current : undefined,
        speakerId: data.speakerId,
        sourceLang: data.sourceLang,
      };
      setMessages((prev) => {
        if (prev.some((m) => m.utteranceId === data.utteranceId)) return prev;
        return [...prev, newMessage];
      });
    });

    socketInstance.on('utterance-text', (data: { utteranceId: string; text: string; lang: string; isTranslation: boolean }) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.utteranceId === data.utteranceId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          text: data.text,
          targetLang: data.isTranslation ? data.lang : next[idx].targetLang,
          isTranslation: data.isTranslation,
        };
        return next;
      });
    });

    socketInstance.on('utterance-audio', async (data: { utteranceId: string; base64Audio: string; targetLang: string }) => {
      if (!audioEnabledRef.current) return;
      await s2sAudioPlayer.resume();
      s2sAudioPlayer.playChunk(data.base64Audio);
    });

    socketInstance.on('utterance-done', (data: { utteranceId: string }) => {
      // Finalize any pending UI state for the utterance if needed.
      if (import.meta.env.DEV) {
        console.log('[Conversation] utterance done', data.utteranceId);
      }
    });

    socketInstance.on('utterance-error', (data: { utteranceId: string; message: string }) => {
      toast.error(data.message || 'Speech error');
      stopRecordingInternalRef.current();
    });

    socketInstance.on('error', (error: string) => toast.error(error));

    // Handle participant status changes
    socketInstance.on('participant-status-changed', (data: {
      userId: string;
      status: ParticipantStatus;
      lastSeen: Date;
    }) => {
      setParticipantStatuses(prev => new Map(prev).set(data.userId, {
        status: data.status,
        lastSeen: new Date(data.lastSeen)
      }));
    });

    setSocket(socketInstance);

    return () => {
      // Best-effort leave so peers get user-left before the socket drops.
      if (socketInstance.connected) {
        socketInstance.emit('leave-room');
      }
      socketInstance.disconnect();
    };
  }, [code, user?.id, s2sAudioPlayer]);

  // Handle visibility changes for participant status
  useEffect(() => {
    if (!socket) return;

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      const newStatus = isVisible ? 'active' : 'away';

      socket.emit('participant-status-update', { status: newStatus });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [socket]);

  useEffect(() => {
    return () => stopRecordingForUnmountRef.current();
  }, []);

  const toggleAudio = async () => {
    const next = !audioEnabled;
    setAudioEnabled(next);

    if (next) {
      await s2sAudioPlayer.resume();
    } else {
      s2sAudioPlayer.clear();
    }
  };

  const handleUpdateLanguage = (value: string) => {
    updateLanguageMutation.mutate(value);
  };

  const hasOtherParticipants = !!roomData?.participants?.some((p) => p.id !== user?.id);
  const canStartRecording = hasOtherParticipants;

  const handleLeave = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave-room');
    }
    navigate('/dashboard');
  }, [navigate]);

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
          onLeave={handleLeave}
          userLanguage={user?.language}
          onUpdateLanguage={handleUpdateLanguage}
          isUpdatingLanguage={updateLanguageMutation.isPending}
          isSettingsOpen={isRoomSettingsOpen}
          onSettingsOpenChange={setIsRoomSettingsOpen}
          isRecording={isRecording}
          hasOtherParticipants={hasOtherParticipants}
          participants={(roomData.participants ?? []).map(p => ({
            ...p,
            status: participantStatuses.get(p.id)?.status || 'active',
            lastSeen: participantStatuses.get(p.id)?.lastSeen
          }))}
          currentUserId={user?.id}
        />

        <DebugPanel
          isDebugEnabled={isDebugEnabled}
          debugPanelExpanded={debugPanelExpanded}
          setDebugPanelExpanded={setDebugPanelExpanded}
          s2SStatus={s2sStatus}
        />
      </Card>

      <Card className="min-h-0 overflow-hidden flex flex-col rounded-none border-t-0 shadow-none">
        <MessageList messages={messages} currentUserId={user?.id} />
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
        />
      </Card>
    </div>
  );
};

export default Conversation;
