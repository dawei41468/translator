import { TranslationEngine } from './translation-engine.js';
import { logger } from '../../logger.js';

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