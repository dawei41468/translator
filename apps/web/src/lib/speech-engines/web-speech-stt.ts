import { SttEngine } from './types';

export class WebSpeechSttEngine implements SttEngine {
  private recognition: any = null;
  private stream: MediaStream | null = null;
  private language: string = 'en-US';

  isAvailable(): boolean {
    return typeof window !== 'undefined' &&
           ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }

  getName(): string {
    return 'Web Speech API (Browser)';
  }

  async initialize(config: { language: string }): Promise<void> {
    this.language = config.language;
  }

  private createRecognitionInstance(): any {
    const SpeechRecognition = (window as any).SpeechRecognition ||
                             (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.language;
    return recognition;
  }

  async startRecognition(options: {
    onResult: (text: string, isFinal: boolean) => void;
    onError: (error: Error) => void;
  }): Promise<MediaStream> {
    // Create a new recognition instance each time (required for Android PWA)
    this.recognition = this.createRecognitionInstance();

    // Set up event handlers
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
      console.error('Speech recognition error:', event.error, event);
      options.onError(new Error(event.error || 'Speech recognition failed'));
    };

    this.recognition.onend = () => {
      console.log('Speech recognition ended');
    };

    // Start recognition first - this handles microphone permission internally on Android PWA
    this.recognition.start();

    // Wait a bit for recognition to initialize, then try to get explicit media stream
    // This is a workaround for Android PWA compatibility
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Try to get the active media stream if available
      // On Android PWA, speech recognition may work without explicit getUserMedia
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.warn('Could not get explicit media stream, but speech recognition may still work:', error);
      // Don't throw error here - speech recognition might work without explicit stream access
      // Create an empty stream as fallback
      this.stream = new MediaStream();
    }

    return this.stream;
  }

  async stopRecognition(): Promise<void> {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.warn('Error stopping recognition:', error);
      }
      // Clear the recognition instance so a new one can be created next time
      this.recognition = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
}