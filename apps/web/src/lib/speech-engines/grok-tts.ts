import { TtsEngine } from './types';
import { apiClient } from '../api';

export class GrokTtsEngine implements TtsEngine {
  private audioContext: AudioContext | null = null;

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
      console.error('Grok TTS synthesis failed:', error);
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
    const configs: Record<string, { languageCode: string; voiceName: string; ssmlGender: string }> = {
      'en': { languageCode: 'en-US', voiceName: 'eve', ssmlGender: 'FEMALE' },
      'zh': { languageCode: 'cmn-CN', voiceName: 'eve', ssmlGender: 'FEMALE' },
      'ko': { languageCode: 'ko-KR', voiceName: 'eve', ssmlGender: 'FEMALE' },
      'es': { languageCode: 'es-ES', voiceName: 'eve', ssmlGender: 'FEMALE' },
      'ja': { languageCode: 'ja-JP', voiceName: 'eve', ssmlGender: 'FEMALE' },
      'it': { languageCode: 'it-IT', voiceName: 'eve', ssmlGender: 'FEMALE' },
      'de': { languageCode: 'de-DE', voiceName: 'eve', ssmlGender: 'FEMALE' },
      'nl': { languageCode: 'nl-NL', voiceName: 'eve', ssmlGender: 'FEMALE' },
    };
    return configs[language] || configs['en'];
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
