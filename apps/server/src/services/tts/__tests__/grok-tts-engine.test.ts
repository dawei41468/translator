import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GrokTtsEngine } from '../grok-tts-engine.js';

describe('GrokTtsEngine', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('isAvailable returns true when api key is set', () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokTtsEngine();
    expect(engine.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when api key is missing', () => {
    delete process.env.GROK_API_KEY;
    const engine = new GrokTtsEngine();
    expect(engine.isAvailable()).toBe(false);
  });

  it('getName returns Grok TTS', () => {
    const engine = new GrokTtsEngine();
    expect(engine.getName()).toBe('Grok TTS');
  });

  it('synthesize returns audio buffer on success', async () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokTtsEngine();

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });

    const result = await engine.synthesize({ text: 'Hello', languageCode: 'en' });
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(8);
  });

  it('synthesize throws when api returns non-ok', async () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokTtsEngine();

    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    });

    await expect(engine.synthesize({ text: 'Hello', languageCode: 'en' }))
      .rejects.toThrow('Grok TTS failed: 500 server error');
  });

  it('synthesize throws when api key is missing', async () => {
    delete process.env.GROK_API_KEY;
    const engine = new GrokTtsEngine();

    await expect(engine.synthesize({ text: 'Hello', languageCode: 'en' }))
      .rejects.toThrow('GROK_API_KEY is not configured');
  });

  it('maps voice names correctly', async () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokTtsEngine();

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
    });

    await engine.synthesize({ text: 'Hello', languageCode: 'en', voiceName: 'en-US-Wavenet-D-Male' });

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.voice).toBe('leo');
  });

  it('defaults voice to eve when not recognized', async () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokTtsEngine();

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
    });

    await engine.synthesize({ text: 'Hello', languageCode: 'en' });

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.voice).toBe('eve');
  });
});
