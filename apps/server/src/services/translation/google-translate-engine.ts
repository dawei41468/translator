import { TranslationEngine } from './translation-engine.js';
import { TranslationServiceClient } from "@google-cloud/translate";
import { logger } from '../../logger.js';

export class GoogleTranslateEngine implements TranslationEngine {
  private client: TranslationServiceClient | null = null;
  private projectId: string;
  private location: string;

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
    this.location = this.getTranslationLocation();
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

    return response.translations[0].translatedText;
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