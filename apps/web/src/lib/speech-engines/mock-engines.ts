import { SttEngine, TtsEngine } from './types';

export class MockSttEngine implements SttEngine {
  private isRecognizing = false;
  private onResult: ((text: string, isFinal: boolean) => void) | null = null;

  async initialize(config: { language: string }): Promise<void> {
    console.log('Mock STT initialized', config);
  }

  async startRecognition(options: {
    onResult: (text: string, isFinal: boolean) => void;
    onError: (error: Error) => void;
  }): Promise<MediaStream> {
    this.isRecognizing = true;
    this.onResult = options.onResult;
    
    // Create a dummy stream
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const streamDestination = audioContext.createMediaStreamDestination();
    oscillator.connect(streamDestination);
    oscillator.start();
    
    console.log('Mock STT recognition started');
    
    // Simulate a result after a delay
    setTimeout(() => {
      if (this.isRecognizing && this.onResult) {
        this.onResult('This is a mock transcript', true);
      }
    }, 2000);

    return streamDestination.stream;
  }

  async stopRecognition(): Promise<void> {
    this.isRecognizing = false;
    this.onResult = null;
    console.log('Mock STT recognition stopped');
  }

  isAvailable(): boolean {
    return true;
  }

  getName(): string {
    return 'Mock STT Engine';
  }
}

export class MockTtsEngine implements TtsEngine {
  async initialize(): Promise<void> {
    console.log('Mock TTS initialized');
  }

  async speak(text: string, language: string): Promise<void> {
    console.log(`Mock TTS speaking: "${text}" in ${language}`);
    // Simulate playback time
    return new Promise((resolve) => setTimeout(resolve, 1000));
  }

  stop(): void {
    console.log('Mock TTS stopped');
  }

  isAvailable(): boolean {
    return true;
  }

  async getVoices(): Promise<Array<{ id: string; name: string; lang: string }>> {
    return [
      { id: 'mock-voice-1', name: 'Mock Female Voice', lang: 'en-US' },
      { id: 'mock-voice-2', name: 'Mock Male Voice', lang: 'en-US' }
    ];
  }

  getName(): string {
    return 'Mock TTS Engine';
  }
}
