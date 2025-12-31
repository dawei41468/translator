import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

interface Message {
  id: string;
  text: string;
  translatedText?: string;
  isOwn: boolean;
  timestamp: Date;
}

const Conversation = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [outputDeviceId, setOutputDeviceId] = useState<string>('');

  // Get room info
  const { data: roomData, isLoading } = useQuery({
    queryKey: ["room", code],
    queryFn: () => apiClient.getRoom(code!),
    enabled: !!code,
  });

  // Initialize Socket.io
  useEffect(() => {
    if (!code) return;

    const socketInstance = io(import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:4003', {
      auth: {
        token: document.cookie.split('; ').find(row => row.startsWith('auth_token='))?.split('=')[1]
      }
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      // Join the room
      socketInstance.emit('join-room', code);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('joined-room', (_data: any) => {
      toast.success('Connected to conversation');
    });

    socketInstance.on('user-joined', (_data: any) => {
      toast.info('Other participant joined');
    });

    socketInstance.on('user-left', (_data: any) => {
      toast.info('Other participant left');
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
      if (audioEnabled && synthRef.current) {
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
  }, [code, audioEnabled]);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = roomData?.participants.find(p => p.id !== 'current')?.language || 'en';

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
  }, [socket, roomData]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast.error('Speech recognition not supported');
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
    setAudioEnabled(!audioEnabled);
    if (!audioEnabled && synthRef.current) {
      synthRef.current.cancel(); // Stop any current speech
    }
  };

  const selectOutputDevice = async () => {
    if ('selectAudioOutput' in navigator.mediaDevices) {
      try {
        const device = await (navigator.mediaDevices as any).selectAudioOutput();
        setOutputDeviceId(device.deviceId);
        toast.success('Output device selected');
      } catch (error) {
        console.error('Error selecting output device:', error);
        toast.error('Failed to select output device');
      }
    } else {
      toast.error('Audio output selection not supported on this device');
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!roomData) {
    return <div className="flex items-center justify-center min-h-screen">Room not found</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4 sm:p-6 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="font-medium">Room: {roomData.code}</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleAudio}
            className={`p-2 rounded ${audioEnabled ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            🔊
          </button>
          <button
            onClick={selectOutputDevice}
            className="p-2 rounded bg-gray-200 hover:bg-gray-300"
            title="Select audio output device"
          >
            🎧
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-3 py-1 bg-gray-500 text-white rounded"
          >
            Leave
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
            disabled={!isConnected}
            className={`px-6 py-3 sm:px-8 sm:py-4 rounded-full font-medium ${
              isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-green-500 text-white hover:bg-green-600'
            } disabled:opacity-50`}
          >
            {isRecording ? 'Stop Speaking' : 'Start Speaking'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Conversation;