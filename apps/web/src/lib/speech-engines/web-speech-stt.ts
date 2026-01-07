import { SttEngine } from './types';

export class WebSpeechSttEngine implements SttEngine {
  private recognition: any = null;
  private stream: MediaStream | null = null;

  isAvailable(): boolean {
    return typeof window !== 'undefined' &&
           ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }

  getName(): string {
    return 'Web Speech API (Browser)';
  }

  async initialize(config: { language: string }): Promise<void> {
    const SpeechRecognition = (window as any).SpeechRecognition ||
                             (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = config.language;
  }

  async startRecognition(options: {
    onResult: (text: string, isFinal: boolean) => void;
    onError: (error: Error) => void;
  }): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.recognition.onresult = (event: any) => {
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

      if (finalTranscript) {
        options.onResult(finalTranscript, true);
      } else if (interimTranscript) {
        options.onResult(interimTranscript, false);
      }
    };

    this.recognition.onerror = (event: any) => {
      options.onError(new Error(event.error));
    };

    this.recognition.start();
    return this.stream;
  }

  async stopRecognition(): Promise<void> {
    if (this.recognition) {
      this.recognition.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
}