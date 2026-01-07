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
    console.log('WebSpeechSttEngine: Starting recognition with language:', this.language);

    // Create a new recognition instance each time (required for Android PWA)
    this.recognition = this.createRecognitionInstance();
    console.log('WebSpeechSttEngine: Created new recognition instance');

    // Set up event handlers
    this.recognition.onstart = () => {
      console.log('WebSpeechSttEngine: Recognition started successfully');
    };

    this.recognition.onresult = (event: any) => {
      console.log('WebSpeechSttEngine: Recognition result received', event);
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

      console.log('WebSpeechSttEngine: Processed transcripts - Final:', finalTranscript, 'Interim:', interimTranscript);

      if (finalTranscript) {
        options.onResult(finalTranscript, true);
      } else if (interimTranscript) {
        options.onResult(interimTranscript, false);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('WebSpeechSttEngine: Recognition error:', event.error, event);
      options.onError(new Error(event.error || 'Speech recognition failed'));
    };

    this.recognition.onend = () => {
      console.log('WebSpeechSttEngine: Recognition ended');
    };

    // Get microphone permission first to avoid conflicts on Android PWA
    try {
      console.log('WebSpeechSttEngine: Attempting to get media stream');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('WebSpeechSttEngine: Media stream obtained successfully');
    } catch (error) {
      console.warn('WebSpeechSttEngine: Could not get explicit media stream, but speech recognition may still work:', error);
      // Don't throw error here - speech recognition might work without explicit stream access
      // Create an empty stream as fallback
      this.stream = new MediaStream();
    }

    // Start recognition after microphone access is established
    console.log('WebSpeechSttEngine: Calling recognition.start()');
    this.recognition.start();

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