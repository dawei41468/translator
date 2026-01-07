import { TtsEngine } from './types';

export class WebSpeechTtsEngine implements TtsEngine {
  private synth: SpeechSynthesis | null = null;

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  getName(): string {
    return 'Web Speech API (Browser)';
  }

  async initialize(): Promise<void> {
    this.synth = window.speechSynthesis;
  }

  async speak(text: string, language: string): Promise<void> {
    if (!this.synth) throw new Error('TTS not initialized');

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.getLocale(language);

      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(event.error));

      this.synth!.speak(utterance);
    });
  }

  stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }
  }

  async getVoices(): Promise<Array<{ id: string; name: string; lang: string }>> {
    if (!this.synth) return [];

    return this.synth.getVoices().map(voice => ({
      id: voice.voiceURI,
      name: voice.name,
      lang: voice.lang
    }));
  }

  private getLocale(language: string): string {
    switch (language.toLowerCase()) {
      case 'zh': return 'zh-CN';
      case 'it': return 'it-IT';
      case 'de': return 'de-DE';
      case 'nl': return 'nl-NL';
      default: return 'en-US';
    }
  }
}