import { TtsEngine, type TtsSynthesizeOptions } from './tts-engine.js';
import { logger } from '../../logger.js';



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

    const voice = this.mapVoiceName(options.voiceName) || 'eve';
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

  private mapVoiceName(voiceName?: string): string | undefined {
    const validVoices = ['ara', 'eve', 'leo', 'rex', 'sal'];
    if (!voiceName) return undefined;
    const lower = voiceName.toLowerCase();
    if (validVoices.includes(lower)) return lower;
    // Fallback mappings from Google voice names
    if (lower.includes('male')) return 'leo';
    return 'eve';
  }
}
