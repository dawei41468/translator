import { SttEngine } from './stt-engine.js';
import { logger } from '../../logger.js';

export class SttEngineRegistry {
  private engines = new Map<string, SttEngine>();
  private userPreferences = new Map<string, string>();

  registerEngine(id: string, engine: SttEngine): void {
    this.engines.set(id, engine);
  }

  setUserPreference(userId: string, engineId: string): void {
    this.userPreferences.set(userId, engineId);
  }

  getEngine(userId?: string): SttEngine {
    const preferredId = userId ? this.userPreferences.get(userId) : undefined;
    const defaultId = 'google-cloud-stt';
    const id = preferredId || defaultId;

    const engine = this.engines.get(id);
    if (engine && engine.isAvailable()) {
      return engine;
    }

    // Fallback to first available engine
    for (const [fallbackId, fallback] of this.engines) {
      if (fallback.isAvailable()) {
        if (id !== fallbackId) {
          logger.warn(`STT engine ${id} not available, falling back to ${fallbackId}`, { userId });
        }
        return fallback;
      }
    }

    throw new Error('No STT engine available');
  }

  getAvailableEngines(): Array<{ id: string; name: string }> {
    return Array.from(this.engines.entries())
      .filter(([_, engine]) => engine.isAvailable())
      .map(([id, engine]) => ({ id, name: engine.getName() }));
  }
}

export const sttRegistry = new SttEngineRegistry();
