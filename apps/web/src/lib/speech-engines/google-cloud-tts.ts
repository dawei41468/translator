import { TtsEngine } from './types';
import { apiClient } from '../api';

export class GoogleCloudTtsEngine implements TtsEngine {
  private audioContext: AudioContext | null = null;
  private availableVoices: any[] = [];

  constructor() {}

  isAvailable(): boolean {
    return true; // Now server-side, always available as long as server is up
  }

  getName(): string {
    return 'Google Cloud TTS';
  }

  async initialize(): Promise<void> {
    // AudioContext for playing the audio
    if (typeof window !== 'undefined' && !this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Handle state changes
      this.audioContext.onstatechange = () => {
        console.log('Google Cloud TTS: AudioContext state changed:', this.audioContext?.state);
      };
    }

    // Voice fetching could be moved to server as well for full security,
    // but for now we'll use a hardcoded set or a server endpoint if we add one later.
    // The current implementation of speak() uses hardcoded defaults if voices aren't loaded.
    this.availableVoices = [
      { name: 'en-US-Neural2-C', languageCodes: ['en-US'], ssmlGender: 'FEMALE' },
      { name: 'cmn-CN-Wavenet-A', languageCodes: ['cmn-CN'], ssmlGender: 'FEMALE' },
      { name: 'ko-KR-Standard-A', languageCodes: ['ko-KR'], ssmlGender: 'FEMALE' },
      { name: 'es-ES-Standard-A', languageCodes: ['es-ES'], ssmlGender: 'FEMALE' },
      { name: 'ja-JP-Standard-A', languageCodes: ['ja-JP'], ssmlGender: 'FEMALE' },
      { name: 'it-IT-Neural2-A', languageCodes: ['it-IT'], ssmlGender: 'FEMALE' },
      { name: 'de-DE-Neural2-G', languageCodes: ['de-DE'], ssmlGender: 'FEMALE' },
      { name: 'nl-NL-Wavenet-F', languageCodes: ['nl-NL'], ssmlGender: 'FEMALE' },
    ];
  }

  async speak(text: string, language: string): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    // Resume AudioContext if it's suspended (browser policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Map language codes to Google Cloud TTS voices
    const voiceConfig = this.getVoiceConfig(language);

    try {
      const audioArrayBuffer = await apiClient.synthesizeSpeech({
        text,
        languageCode: voiceConfig.languageCode,
        voiceName: voiceConfig.voiceName,
        ssmlGender: voiceConfig.ssmlGender,
      });

      const audioBuffer = await this.audioContext.decodeAudioData(audioArrayBuffer);
      await this.playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error('Google Cloud TTS synthesis failed:', error);
      throw error;
    }
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
      'en': { languageCode: 'en-US', voiceName: 'en-US-Neural2-C', ssmlGender: 'FEMALE' },
      'zh': { languageCode: 'cmn-CN', voiceName: 'cmn-CN-Wavenet-A', ssmlGender: 'FEMALE' },
      'ko': { languageCode: 'ko-KR', voiceName: 'ko-KR-Standard-A', ssmlGender: 'FEMALE' },
      'es': { languageCode: 'es-ES', voiceName: 'es-ES-Standard-A', ssmlGender: 'FEMALE' },
      'ja': { languageCode: 'ja-JP', voiceName: 'ja-JP-Standard-A', ssmlGender: 'FEMALE' },
      'it': { languageCode: 'it-IT', voiceName: 'it-IT-Neural2-A', ssmlGender: 'FEMALE' },
      'de': { languageCode: 'de-DE', voiceName: 'de-DE-Neural2-G', ssmlGender: 'FEMALE' },
      'nl': { languageCode: 'nl-NL', voiceName: 'nl-NL-Wavenet-F', ssmlGender: 'FEMALE' },
    };

    return configs[language] || configs['en'];
  }

  private getLanguageCode(language: string): string {
    const codes: Record<string, string> = {
      'en': 'en-US',
      'zh': 'cmn-CN',
      'ko': 'ko-KR',
      'es': 'es-ES',
      'ja': 'ja-JP',
      'it': 'it-IT',
      'de': 'de-DE',
      'nl': 'nl-NL',
    };
    return codes[language] || 'en-US';
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