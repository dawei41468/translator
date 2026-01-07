export interface Message {
  id: string;
  text: string;
  translatedText?: string;
  isOwn: boolean;
  timestamp: Date;
  speakerName?: string;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface SttStatus {
  isRecording: boolean;
  lastError?: string;
  lastAttempt?: string;
  recognitionStarted: boolean;
  transcriptsReceived: number;
  language: string;
}

export interface TtsStatus {
  voicesCount: number;
  isSpeaking: boolean;
  lastError?: string;
  lastAttempt?: string;
  voicesLoaded: boolean;
}
