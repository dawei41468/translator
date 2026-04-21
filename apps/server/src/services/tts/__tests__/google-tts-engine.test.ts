import { describe, it, expect, vi } from 'vitest';
import { GoogleTtsEngine } from '../google-tts-engine.js';
import { synthesizeSpeech } from '../../tts.js';

vi.mock('../../tts.js', () => ({
  synthesizeSpeech: vi.fn().mockResolvedValue(Buffer.from('google-audio')),
}));

describe('GoogleTtsEngine', () => {
  it('is always available', () => {
    const engine = new GoogleTtsEngine();
    expect(engine.isAvailable()).toBe(true);
  });

  it('getName returns Google Cloud TTS', () => {
    const engine = new GoogleTtsEngine();
    expect(engine.getName()).toBe('Google Cloud TTS');
  });

  it('synthesize delegates to synthesizeSpeech', async () => {
    const engine = new GoogleTtsEngine();
    const result = await engine.synthesize({
      text: 'Hello',
      languageCode: 'en-US',
      voiceName: 'en-US-Wavenet-A',
    });

    expect(synthesizeSpeech).toHaveBeenCalledWith({
      text: 'Hello',
      languageCode: 'en-US',
      voiceName: 'en-US-Wavenet-A',
      ssmlGender: undefined,
    });
    expect(result).toEqual(Buffer.from('google-audio'));
  });
});
