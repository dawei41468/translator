import { TtsEngine } from './types';
import { apiClient } from '../api';

export class GrokTtsEngine implements TtsEngine {
  private audioContext: AudioContext | null = null;
  private voicePreference?: string;

  constructor(voicePreference?: string) {
    this.voicePreference = voicePreference;
  }

  isAvailable(): boolean {
    return true; // Server-side, always available as long as server is up
  }

  getName(): string {
    return 'Grok TTS';
  }

  async initialize(): Promise<void> {
    if (typeof window !== 'undefined' && !this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  async speak(text: string, language: string): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    try {
      const voiceConfig = this.getVoiceConfig(language);
      const audioArrayBuffer = await apiClient.synthesizeSpeech({
        text,
        languageCode: voiceConfig.languageCode,
        voiceName: voiceConfig.voiceName,
        ssmlGender: voiceConfig.ssmlGender,
      });

      const audioBuffer = await this.audioContext.decodeAudioData(audioArrayBuffer);
      await this.playAudioBuffer(audioBuffer);
    } catch (error) {
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
    return [
      { id: 'eve', name: 'Eve (energetic)', lang: 'en' },
      { id: 'ara', name: 'Ara (warm)', lang: 'en' },
      { id: 'leo', name: 'Leo (authoritative)', lang: 'en' },
      { id: 'rex', name: 'Rex (confident)', lang: 'en' },
      { id: 'sal', name: 'Sal (balanced)', lang: 'en' },
    ];
  }

  private getVoiceConfig(language: string): { languageCode: string; voiceName: string; ssmlGender: string } {
    // Use user's voice preference if set, otherwise use language-specific default
    const voiceName = this.voicePreference || this.getDefaultVoiceForLanguage(language);

    const langCodes: Record<string, string> = {
      'en': 'en-US',
      'zh': 'cmn-CN',
      'ko': 'ko-KR',
      'es': 'es-ES',
      'ja': 'ja-JP',
      'it': 'it-IT',
      'de': 'de-DE',
      'nl': 'nl-NL',
    };

    return {
      languageCode: langCodes[language] || 'en-US',
      voiceName,
      ssmlGender: 'FEMALE',
    };
  }

  private getDefaultVoiceForLanguage(language: string): string {
    // Language-specific voice defaults
    const langVoices: Record<string, string> = {
      'en': 'eve',
      'zh': 'eve',  // Eve handles tones well
      'ko': 'eve',
      'ja': 'eve',
      'es': 'ara',  // Ara sounds warm for Romance languages
      'it': 'ara',
      'de': 'leo',  // Leo sounds authoritative for German
      'nl': 'sal',  // Sal is balanced for Dutch
    };
    return langVoices[language] || 'eve';
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
