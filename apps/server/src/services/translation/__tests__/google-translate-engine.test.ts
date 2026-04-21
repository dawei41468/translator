import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleTranslateEngine } from '../google-translate-engine.js';
import { TranslationServiceClient } from '@google-cloud/translate';

vi.mock('@google-cloud/translate', () => ({
  TranslationServiceClient: vi.fn().mockImplementation(function() {
    return { translateText: vi.fn() };
  }),
}));

describe('GoogleTranslateEngine', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('isAvailable returns true when project id and credentials are set', () => {
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'my-project';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';
    const engine = new GoogleTranslateEngine();
    expect(engine.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when credentials are missing', () => {
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'my-project';
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const engine = new GoogleTranslateEngine();
    expect(engine.isAvailable()).toBe(false);
  });

  it('getName returns Google Cloud Translation', () => {
    const engine = new GoogleTranslateEngine();
    expect(engine.getName()).toBe('Google Cloud Translation');
  });

  it('initialize creates the client', async () => {
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'my-project';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';
    const engine = new GoogleTranslateEngine();
    await engine.initialize();
    expect(TranslationServiceClient).toHaveBeenCalledTimes(1);
  });

  it('translate returns cached result on second call', async () => {
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'my-project';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';
    const engine = new GoogleTranslateEngine();

    const mockTranslateText = vi.fn().mockResolvedValue([{
      translations: [{ translatedText: 'Hola' }],
    }]);
    (TranslationServiceClient as any).mockImplementation(function() {
      return { translateText: mockTranslateText };
    });

    const result1 = await engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
    expect(result1).toBe('Hola');
    expect(mockTranslateText).toHaveBeenCalledTimes(1);

    const result2 = await engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
    expect(result2).toBe('Hola');
    expect(mockTranslateText).toHaveBeenCalledTimes(1); // cache hit
  });

  it('translate calls API with correct request shape', async () => {
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'my-project';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';
    process.env.GOOGLE_CLOUD_TRANSLATE_LOCATION = 'us-central1';
    const engine = new GoogleTranslateEngine();

    const mockTranslateText = vi.fn().mockResolvedValue([{
      translations: [{ translatedText: 'Bonjour' }],
    }]);
    (TranslationServiceClient as any).mockImplementation(function() {
      return { translateText: mockTranslateText };
    });

    await engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'fr', context: 'Room: 123' });

    expect(mockTranslateText).toHaveBeenCalledWith({
      parent: 'projects/my-project/locations/us-central1',
      contents: ['Hello'],
      mimeType: 'text/plain',
      sourceLanguageCode: 'en',
      targetLanguageCode: 'fr',
    });
  });

  it('translate throws when no translation returned', async () => {
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'my-project';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';
    const engine = new GoogleTranslateEngine();

    const mockTranslateText = vi.fn().mockResolvedValue([{
      translations: [],
    }]);
    (TranslationServiceClient as any).mockImplementation(function() {
      return { translateText: mockTranslateText };
    });

    await expect(engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' }))
      .rejects.toThrow('No translation returned');
  });

  it('translate returns empty text unchanged', async () => {
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'my-project';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';
    const engine = new GoogleTranslateEngine();
    const result = await engine.translate({ text: '   ', sourceLang: 'en', targetLang: 'es' });
    expect(result).toBe('   ');
  });

  it('falls back to global for unsupported location', async () => {
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'my-project';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';
    process.env.GOOGLE_CLOUD_TRANSLATE_LOCATION = 'mars';
    const engine = new GoogleTranslateEngine();

    const mockTranslateText = vi.fn().mockResolvedValue([{
      translations: [{ translatedText: 'Hola' }],
    }]);
    (TranslationServiceClient as any).mockImplementation(function() {
      return { translateText: mockTranslateText };
    });

    await engine.translate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' });
    expect(mockTranslateText).toHaveBeenCalledWith(
      expect.objectContaining({ parent: 'projects/my-project/locations/global' })
    );
  });

  it('getSupportedLanguages returns expected languages', async () => {
    const engine = new GoogleTranslateEngine();
    const languages = await engine.getSupportedLanguages();
    expect(languages).toContainEqual({ code: 'en', name: 'English' });
    expect(languages).toContainEqual({ code: 'zh', name: 'Chinese' });
  });

  it('estimateCost returns a positive number', () => {
    const engine = new GoogleTranslateEngine();
    expect(engine.estimateCost('hello world', 'en', 'es')).toBeGreaterThan(0);
  });
});
