import { SttEngine, TtsEngine } from './types';

export class SpeechEngineRegistry {
  private sttEngines = new Map<string, SttEngine>();
  private ttsEngines = new Map<string, TtsEngine>();
  private userPreferences: { stt: string; tts: string; translation?: string };

  constructor(preferences: { stt?: string; tts?: string; translation?: string } = {}) {
    this.userPreferences = {
      stt: preferences.stt || 'web-speech-api',
      tts: preferences.tts || 'web-speech-api',
      translation: preferences.translation || 'google-translate'
    };
  }

  registerSttEngine(id: string, engine: SttEngine): void {
    this.sttEngines.set(id, engine);
  }

  registerTtsEngine(id: string, engine: TtsEngine): void {
    this.ttsEngines.set(id, engine);
  }

  getSttEngine(): SttEngine {
    const engine = this.sttEngines.get(this.userPreferences.stt);
    if (!engine || !engine.isAvailable()) {
      for (const [id, fallback] of this.sttEngines) {
        if (fallback.isAvailable()) {
          console.warn(`STT engine ${this.userPreferences.stt} not available, falling back to ${id}`);
          return fallback;
        }
      }
      throw new Error('No STT engine available');
    }
    return engine;
  }

  getTtsEngine(): TtsEngine {
    const engine = this.ttsEngines.get(this.userPreferences.tts);
    if (!engine || !engine.isAvailable()) {
      for (const [id, fallback] of this.ttsEngines) {
        if (fallback.isAvailable()) {
          console.warn(`TTS engine ${this.userPreferences.tts} not available, falling back to ${id}`);
          return fallback;
        }
      }
      throw new Error('No TTS engine available');
    }
    return engine;
  }


  getAvailableSttEngines(): Array<{ id: string; name: string }> {
    return Array.from(this.sttEngines.entries())
      .filter(([_, engine]) => engine.isAvailable())
      .map(([id, engine]) => ({ id, name: engine.getName() }));
  }

  getAvailableTtsEngines(): Array<{ id: string; name: string }> {
    return Array.from(this.ttsEngines.entries())
      .filter(([_, engine]) => engine.isAvailable())
      .map(([id, engine]) => ({ id, name: engine.getName() }));
  }
}
