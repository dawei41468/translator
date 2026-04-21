import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GrokTranslateEngine } from '../grok-translate-engine.js';

describe('GrokTranslateEngine', () => {
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
    process.env.GROK_API_KEY = 'my-key';
    const engine = new GrokTranslateEngine();
    expect(engine.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when api key is missing', () => {
    delete process.env.GROK_API_KEY;
    const engine = new GrokTranslateEngine();
    expect(engine.isAvailable()).toBe(false);
  });

  it('getName returns Grok (xAI) Translation', () => {
    const engine = new GrokTranslateEngine();
    expect(engine.getName()).toBe('Grok (xAI) Translation');
  });

  it('uses custom base url and model from env', async () => {
    process.env.GROK_API_KEY = 'my-key';
    process.env.GROK_API_BASE_URL = 'https://custom.x.ai/v1/';
    process.env.GROK_TRANSLATE_MODEL = 'custom-model';

    const engine = new GrokTranslateEngine();

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hola' } }],
      }),
    });

    await engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://custom.x.ai/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('custom-model'),
      })
    );
  });

  it('translate returns translated text on success', async () => {
    process.env.GROK_API_KEY = 'my-key';
    const engine = new GrokTranslateEngine();

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  Hola  ' } }],
      }),
    });

    const result = await engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
    expect(result).toBe('Hola');
  });

  it('translate returns cached result on second call', async () => {
    process.env.GROK_API_KEY = 'my-key';
    const engine = new GrokTranslateEngine();

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hola' } }],
      }),
    });

    await engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
    await engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('translate throws when api returns non-ok', async () => {
    process.env.GROK_API_KEY = 'my-key';
    const engine = new GrokTranslateEngine();

    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'rate limited',
    });

    await expect(engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' }))
      .rejects.toThrow('Grok API error: 429 Too Many Requests');
  });

  it('translate throws when response has no content', async () => {
    process.env.GROK_API_KEY = 'my-key';
    const engine = new GrokTranslateEngine();

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: {} }],
      }),
    });

    await expect(engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' }))
      .rejects.toThrow('No translation returned from Grok');
  });

  it('translate throws when api key is missing', async () => {
    delete process.env.GROK_API_KEY;
    const engine = new GrokTranslateEngine();

    await expect(engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' }))
      .rejects.toThrow('GROK_API_KEY is not configured');
  });

  it('translate returns empty text unchanged', async () => {
    process.env.GROK_API_KEY = 'my-key';
    const engine = new GrokTranslateEngine();
    const result = await engine.translate({ text: '   ', sourceLang: 'en', targetLang: 'es' });
    expect(result).toBe('   ');
  });

  it('translate aborts after timeout', async () => {
    vi.useFakeTimers();
    process.env.GROK_API_KEY = 'my-key';
    const engine = new GrokTranslateEngine();

    (globalThis.fetch as any).mockImplementation((_url: string, options: any) => {
      return new Promise((_, reject) => {
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            reject(new Error('AbortError'));
          });
        }
      });
    });

    const promise = engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
    vi.advanceTimersByTime(11000);

    await expect(promise).rejects.toThrow();
    vi.useRealTimers();
  });

  it('includes context in prompt when provided', async () => {
    process.env.GROK_API_KEY = 'my-key';
    const engine = new GrokTranslateEngine();

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hola' } }],
      }),
    });

    await engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es', context: 'Business meeting' });

    const callArgs = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.messages[1].content).toContain('Business meeting');
  });

  it('getSupportedLanguages returns expected languages', async () => {
    const engine = new GrokTranslateEngine();
    const languages = await engine.getSupportedLanguages();
    expect(languages).toContainEqual({ code: 'en', name: 'English' });
    expect(languages).toContainEqual({ code: 'zh', name: 'Chinese' });
  });

  it('estimateCost returns a positive number', () => {
    const engine = new GrokTranslateEngine();
    expect(engine.estimateCost('hello world', 'en', 'es')).toBeGreaterThan(0);
  });
});
