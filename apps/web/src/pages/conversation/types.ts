export interface Message {
  id: string;
  utteranceId: string;
  text: string;
  translatedText?: string;
  isOwn: boolean;
  timestamp: Date;
  speakerName?: string;
  speakerId?: string;
  sourceLang?: string;
  targetLang?: string;
  isTranslation?: boolean;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface S2SStatus {
  isRecording: boolean;
  lastError?: string;
  lastAttempt?: string;
  language: string;
}

/** @deprecated Retained for compatibility with legacy debug panels. */
export interface SttStatus {
  isRecording: boolean;
  lastError?: string;
  lastAttempt?: string;
  recognitionStarted: boolean;
  transcriptsReceived: number;
  language: string;
}

/** @deprecated Retained for compatibility with legacy debug panels. */
export interface TtsStatus {
  voicesCount: number;
  isSpeaking: boolean;
  voicesLoaded: boolean;
  lastError?: string;
  lastAttempt?: string;
}
