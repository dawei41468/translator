import { TranslationEngine } from './translation-engine.js';
import { logger } from '../../logger.js';

class FallbackTranslationEngine implements TranslationEngine {
  constructor(
    private primaryId: string,
    private primary: TranslationEngine,
    private fallbackId: string,
    private fallback: TranslationEngine,
  ) {}

  async initialize(): Promise<void> {
    await this.primary.initialize();
    await this.fallback.initialize();
  }

  async translate(params: {
    text: string;
    sourceLang: string;
    targetLang: string;
    context?: string;
  }): Promise<string> {
    try {
      return await this.primary.translate(params);
    } catch (error) {
      logger.warn('Primary translation engine failed; falling back', {
        primaryId: this.primaryId,
        fallbackId: this.fallbackId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (!this.fallback.isAvailable()) {
        throw error;
      }

      return this.fallback.translate(params);
    }
  }

  isAvailable(): boolean {
    return this.primary.isAvailable();
  }

  getName(): string {
    return this.primary.getName();
  }

  getSupportedLanguages(): Promise<Array<{ code: string; name: string }>> {
    return this.primary.getSupportedLanguages();
  }

  estimateCost(text: string, sourceLang: string, targetLang: string): number {
    return this.primary.estimateCost(text, sourceLang, targetLang);
  }
}

export class TranslationEngineRegistry {
  private engines = new Map<string, TranslationEngine>();
  private userPreferences = new Map<string, string>();

  registerEngine(id: string, engine: TranslationEngine): void {
    this.engines.set(id, engine);
  }

  getEngine(userId?: string): TranslationEngine {
    const preferredId = userId ? this.userPreferences.get(userId) : undefined;
    const engineId = preferredId || 'google-translate';

    const engine = this.engines.get(engineId);
    if (!engine || !engine.isAvailable()) {
      for (const [id, fallback] of this.engines) {
        if (fallback.isAvailable()) {
          logger.warn(`Translation engine ${engineId} not available, falling back to ${id}`);
          return fallback;
        }
      }
      throw new Error('No translation engine available');
    }

    if (engineId === 'grok-translate') {
      const google = this.engines.get('google-translate');
      if (google) {
        return new FallbackTranslationEngine(engineId, engine, 'google-translate', google);
      }
    }

    return engine;
  }

  setUserPreference(userId: string, engineId: string): void {
    this.userPreferences.set(userId, engineId);
  }

  getAvailableEngines(): Array<{ id: string; name: string }> {
    return Array.from(this.engines.entries())
      .filter(([_, engine]) => engine.isAvailable())
      .map(([id, engine]) => ({ id, name: engine.getName() }));
  }
}

export const translationRegistry = new TranslationEngineRegistry();