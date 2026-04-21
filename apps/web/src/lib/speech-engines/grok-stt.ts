import { SttEngine } from './types';

export class GrokSttEngine implements SttEngine {
  isAvailable(): boolean {
    return true; // Server-based, always available
  }

  getName(): string {
    return 'Grok STT';
  }

  async initialize(_config: { language: string }): Promise<void> {
    // No client-side initialization needed
  }

  async startRecognition(_options: {
    onResult: (text: string, isFinal: boolean) => void;
    onError: (error: Error) => void;
  }): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return stream;
  }

  async stopRecognition(): Promise<void> {
    // MediaRecorder cleanup happens in Conversation.tsx
  }
}
