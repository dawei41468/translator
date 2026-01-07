import { SttEngine } from './types';

export class GoogleCloudSttEngine implements SttEngine {
  isAvailable(): boolean {
    return true; // Server-based, always available
  }

  getName(): string {
    return 'Google Cloud STT';
  }

  async initialize(_config: { language: string }): Promise<void> {
    // No client-side initialization needed
  }

  async startRecognition(_options: {
    onResult: (text: string, isFinal: boolean) => void;
    onError: (error: Error) => void;
  }): Promise<MediaStream> {
    // Get microphone access for MediaRecorder
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Return stream for MediaRecorder setup
    // Recognition results come from server via socket events
    // This engine doesn't call onResult - server handles it
    return stream;
  }

  async stopRecognition(): Promise<void> {
    // MediaRecorder cleanup happens in Conversation.tsx
  }
}