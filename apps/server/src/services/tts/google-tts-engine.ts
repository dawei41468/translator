import { TtsEngine, type TtsSynthesizeOptions } from './tts-engine.js';
import { synthesizeSpeech } from '../tts.js';

export class GoogleTtsEngine implements TtsEngine {
  isAvailable(): boolean {
    return true;
  }

  getName(): string {
    return 'Google Cloud TTS';
  }

  async synthesize(options: TtsSynthesizeOptions): Promise<Buffer> {
    return synthesizeSpeech(options);
  }
}
