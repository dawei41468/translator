import { TtsEngine } from './types';

export class GoogleCloudTtsEngine implements TtsEngine {
  private apiKey: string;
  private baseUrl = 'https://texttospeech.googleapis.com/v1';
  private audioContext: AudioContext | null = null;
  private availableVoices: any[] = [];

  constructor() {
    this.apiKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY || '';
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  getName(): string {
    return 'Google Cloud TTS';
  }

  async initialize(): Promise<void> {
    // AudioContext for playing the audio
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Fetch all available voices and filter to supported languages
    const supportedLanguages = ['en-US', 'cmn-CN', 'it-IT', 'de-DE', 'nl-NL'];
    try {
      const response = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${this.apiKey}`, {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Google Cloud TTS: All fetched voices:', data.voices?.length || 0);
        // Log unique languages
        const allLangs = [...new Set(data.voices?.map((v: any) => v.languageCodes[0]) || [])];
        console.log('Available languages:', allLangs);
        this.availableVoices = (data.voices || []).filter((voice: any) =>
          supportedLanguages.includes(voice.languageCodes[0])
        );
        console.log('Google Cloud TTS: Filtered to', this.availableVoices.length, 'voices for supported languages');
      } else {
        console.error('Failed to fetch voices:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching voices:', error);
    }
  }

  async speak(text: string, language: string): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    // Map language codes to Google Cloud TTS voices
    const voiceConfig = this.getVoiceConfig(language);

    const requestBody = {
      input: { text },
      voice: {
        languageCode: voiceConfig.languageCode,
        name: voiceConfig.voiceName,
        ssmlGender: voiceConfig.ssmlGender
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0,
        volumeGainDb: 0
      }
    };

    const response = await fetch(`${this.baseUrl}/text:synthesize?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Cloud TTS error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Play the audio
    const audioBuffer = await this.decodeBase64Audio(data.audioContent);
    await this.playAudioBuffer(audioBuffer);
  }

  stop(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  async getVoices(): Promise<Array<{ id: string; name: string; lang: string }>> {
    return this.availableVoices.map((voice: any) => ({
      id: voice.name,
      name: `${voice.name} (${voice.ssmlGender})`,
      lang: voice.languageCodes[0],
    }));
  }

  private getVoiceConfig(language: string): { languageCode: string; voiceName: string; ssmlGender: string } {
    // Try to find a female voice for the language from available voices
    const langCode = this.getLanguageCode(language);
    const femaleVoice = this.availableVoices.find(
      (voice: any) =>
        voice.languageCodes.includes(langCode) &&
        voice.ssmlGender === 'FEMALE' &&
        voice.name.includes('Standard') // Prefer Standard over Wavenet for cost
    );

    if (femaleVoice) {
      return {
        languageCode: langCode,
        voiceName: femaleVoice.name,
        ssmlGender: 'FEMALE',
      };
    }

    // Fallback to hardcoded defaults if no voice found
    const configs: Record<string, { languageCode: string; voiceName: string; ssmlGender: string }> = {
      'en': { languageCode: 'en-US', voiceName: 'en-US-Standard-A', ssmlGender: 'FEMALE' },
      'zh': { languageCode: 'zh-CN', voiceName: 'zh-CN-Standard-A', ssmlGender: 'FEMALE' },
      'it': { languageCode: 'it-IT', voiceName: 'it-IT-Standard-A', ssmlGender: 'FEMALE' },
      'de': { languageCode: 'de-DE', voiceName: 'de-DE-Standard-A', ssmlGender: 'FEMALE' },
      'nl': { languageCode: 'nl-NL', voiceName: 'nl-NL-Standard-A', ssmlGender: 'FEMALE' },
    };

    return configs[language] || configs['en'];
  }

  private getLanguageCode(language: string): string {
    const codes: Record<string, string> = {
      'en': 'en-US',
      'zh': 'cmn-CN',
      'it': 'it-IT',
      'de': 'de-DE',
      'nl': 'nl-NL',
    };
    return codes[language] || 'en-US';
  }

  private async decodeBase64Audio(base64Audio: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return await this.audioContext.decodeAudioData(bytes.buffer);
  }

  private async playAudioBuffer(audioBuffer: AudioBuffer): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    return new Promise((resolve) => {
      source.onended = () => resolve();
      source.start(0);
    });
  }
}