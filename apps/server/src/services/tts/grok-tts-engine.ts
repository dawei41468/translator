import { TtsEngine, type TtsSynthesizeOptions } from './tts-engine.js';
import { logger } from '../../logger.js';

const VALID_VOICES = ['ara', 'eve', 'leo', 'rex', 'sal'] as const;
type VoiceId = typeof VALID_VOICES[number];

export class GrokTtsEngine implements TtsEngine {
  isAvailable(): boolean {
    return !!process.env.GROK_API_KEY;
  }

  getName(): string {
    return 'Grok TTS';
  }

  async synthesize(options: TtsSynthesizeOptions): Promise<Buffer> {
    const apiKey = process.env.GROK_API_KEY;
    const baseUrl = process.env.GROK_API_BASE_URL || 'https://api.x.ai/v1';

    if (!apiKey) {
      throw new Error('GROK_API_KEY is not configured');
    }

    const voice = this.resolveVoice(options.voiceName, options.languageCode);
    const sampleRate = 24000;

    const res = await fetch(`${baseUrl}/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-tts',
        text: options.text,
        voice,
        format: 'mp3',
        sample_rate: sampleRate,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error('Grok TTS request failed', { status: res.status, body });
      throw new Error(`Grok TTS failed: ${res.status} ${body}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private resolveVoice(voiceName?: string, languageCode?: string): VoiceId {
    // 1. If a valid voice name is provided, use it
    if (voiceName) {
      const lower = voiceName.toLowerCase();
      if (VALID_VOICES.includes(lower as VoiceId)) {
        return lower as VoiceId;
      }
      // Handle legacy/alias voice name mappings (e.g. gender hints)
      if (lower.includes('male')) return 'leo';
    }

    // 2. Use language-specific defaults
    if (languageCode) {
      return this.getDefaultVoiceForLanguage(languageCode);
    }

    // 3. Final fallback
    return 'eve';
  }

  private getDefaultVoiceForLanguage(languageCode: string): VoiceId {
    // Map language codes to sensible default voices
    const langVoices: Record<string, VoiceId> = {
      'en': 'eve',
      'en-US': 'eve',
      'en-GB': 'eve',
      'zh': 'eve',
      'cmn-CN': 'eve',
      'ko': 'eve',
      'ko-KR': 'eve',
      'ja': 'eve',
      'ja-JP': 'eve',
      'es': 'ara',
      'es-ES': 'ara',
      'it': 'ara',
      'it-IT': 'ara',
      'de': 'leo',
      'de-DE': 'leo',
      'nl': 'sal',
      'nl-NL': 'sal',
    };

    // Try exact match first, then language prefix
    return langVoices[languageCode] || langVoices[languageCode.split('-')[0]] || 'eve';
  }
}
