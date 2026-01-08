import { TranslationEngine } from './translation-engine.js';
import { TranslationServiceClient } from "@google-cloud/translate";
import { logger } from '../../logger.js';
import { LRUCache } from 'lru-cache';

export class GoogleTranslateEngine implements TranslationEngine {
  private client: TranslationServiceClient | null = null;
  private projectId: string;
  private location: string;
  private cache: LRUCache<string, string>;

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
    this.location = this.getTranslationLocation();
    
    // Initialize LRU Cache
    // Capacity: 5000 items (approx 5-10MB RAM depending on text length)
    // TTL: 24 hours
    this.cache = new LRUCache({
      max: 5000,
      ttl: 1000 * 60 * 60 * 24,
      updateAgeOnGet: true,
    });
  }

  isAvailable(): boolean {
    return Boolean(this.projectId);
  }

  getName(): string {
    return 'Google Cloud Translation';
  }

  async initialize(): Promise<void> {
    this.client = new TranslationServiceClient();
  }

  async translate(params: {
    text: string;
    sourceLang: string;
    targetLang: string;
    context?: string;
  }): Promise<string> {
    if (!this.client) await this.initialize();

    const normalizedText = params.text.trim();
    if (!normalizedText) return params.text;

    // Check cache
    // Key format: source:target:text
    // Use MD5 or just string if short? String is fine for typical chat messages.
    // If we wanted to be safer with memory we could limit key length, 
    // but the LRU max size protects us.
    const cacheKey = `${params.sourceLang}:${params.targetLang}:${normalizedText}`;
    
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('Translation cache hit', { 
        source: params.sourceLang, 
        target: params.targetLang, 
        textLen: normalizedText.length 
      });
      return cached;
    }

    const request = {
      parent: `projects/${this.projectId}/locations/${this.location}`,
      contents: [normalizedText],
      mimeType: "text/plain",
      sourceLanguageCode: params.sourceLang,
      targetLanguageCode: params.targetLang,
    };

    const [response] = await this.client!.translateText(request);

    if (!response.translations?.[0]?.translatedText) {
      throw new Error("No translation returned");
    }

    const translatedText = response.translations[0].translatedText;

    // Store in cache
    this.cache.set(cacheKey, translatedText);

    return translatedText;
  }

  async getSupportedLanguages(): Promise<Array<{ code: string; name: string }>> {
    return [
      { code: 'en', name: 'English' },
      { code: 'zh', name: 'Chinese' },
      { code: 'it', name: 'Italian' },
      { code: 'de', name: 'German' },
      { code: 'nl', name: 'Dutch' },
    ];
  }

  estimateCost(text: string): number {
    return text.length * 0.00002;
  }

  private getTranslationLocation(): string {
    const SUPPORTED_TRANSLATION_LOCATIONS = new Set(["global", "us-central1"]);

    const raw =
      process.env.GOOGLE_CLOUD_TRANSLATE_LOCATION ??
      process.env.GOOGLE_CLOUD_LOCATION ??
      "global";

    const location = raw.trim();
    if (SUPPORTED_TRANSLATION_LOCATIONS.has(location)) return location;

    logger.warn("Unsupported Google Translation location; falling back to global", {
      location,
    });
    return "global";
  }
}