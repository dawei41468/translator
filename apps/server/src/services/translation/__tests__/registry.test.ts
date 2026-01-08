import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationEngineRegistry } from '../registry.js';
import { TranslationEngine } from '../translation-engine.js';

describe('TranslationEngineRegistry', () => {
  let registry: TranslationEngineRegistry;
  let mockEngine: TranslationEngine;

  beforeEach(() => {
    registry = new TranslationEngineRegistry();

    mockEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      translate: vi.fn().mockResolvedValue('translated text'),
      isAvailable: () => true,
      getName: () => 'Mock Translation Engine',
      getSupportedLanguages: vi.fn().mockResolvedValue([
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Spanish' }
      ]),
      estimateCost: vi.fn().mockReturnValue(0.001)
    };
  });

  it('should register and retrieve translation engines', () => {
    registry.registerEngine('mock', mockEngine);
    expect(registry.getEngine()).toBe(mockEngine);
  });

  it('should return available engines list', () => {
    registry.registerEngine('mock', mockEngine);

    const available = registry.getAvailableEngines();
    expect(available).toHaveLength(1);
    expect(available[0]).toEqual({ id: 'mock', name: 'Mock Translation Engine' });
  });

  it('should set user preferences', () => {
    registry.registerEngine('mock', mockEngine);
    registry.setUserPreference('user123', 'mock');

    // Should return preferred engine for user
    const engine = registry.getEngine('user123');
    expect(engine).toBe(mockEngine);
  });

  it('should fallback to default engine when user has no preference', () => {
    registry.registerEngine('default', mockEngine);

    const engine = registry.getEngine('user123');
    expect(engine).toBe(mockEngine);
  });

  it('should fallback to available engine when preferred engine is not available', () => {
    const unavailableEngine: TranslationEngine = {
      ...mockEngine,
      isAvailable: () => false
    };

    registry.registerEngine('unavailable', unavailableEngine);
    registry.registerEngine('fallback', mockEngine);

    // Set preference to unavailable engine
    registry.setUserPreference('user123', 'unavailable');

    // Should return fallback engine
    const engine = registry.getEngine('user123');
    expect(engine).toBe(mockEngine);
  });

  it('should throw error when no engines are available', () => {
    const unavailableEngine: TranslationEngine = {
      ...mockEngine,
      isAvailable: () => false
    };

    registry.registerEngine('unavailable', unavailableEngine);

    expect(() => registry.getEngine()).toThrow('No translation engine available');
  });

  it('should call translate method with correct parameters', async () => {
    registry.registerEngine('mock', mockEngine);

    const engine = registry.getEngine();
    await engine.translate({
      text: 'hello',
      sourceLang: 'en',
      targetLang: 'es',
      context: 'test context'
    });

    expect(mockEngine.translate).toHaveBeenCalledWith({
      text: 'hello',
      sourceLang: 'en',
      targetLang: 'es',
      context: 'test context'
    });
  });

  it('should use grok engine when user prefers grok and grok succeeds', async () => {
    const grokEngine: TranslationEngine = {
      ...mockEngine,
      translate: vi.fn().mockResolvedValue('grok translated'),
      getName: () => 'Grok',
    };
    const googleEngine: TranslationEngine = {
      ...mockEngine,
      translate: vi.fn().mockResolvedValue('google translated'),
      getName: () => 'Google',
    };

    registry.registerEngine('google-translate', googleEngine);
    registry.registerEngine('grok-translate', grokEngine);
    registry.setUserPreference('user123', 'grok-translate');

    const engine = registry.getEngine('user123');
    const result = await engine.translate({
      text: 'hello',
      sourceLang: 'en',
      targetLang: 'es',
      context: 'ctx'
    });

    expect(result).toBe('grok translated');
    expect(grokEngine.translate).toHaveBeenCalledTimes(1);
    expect(googleEngine.translate).not.toHaveBeenCalled();
  });

  it('should fallback to google when user prefers grok but grok errors', async () => {
    const grokEngine: TranslationEngine = {
      ...mockEngine,
      translate: vi.fn().mockRejectedValue(new Error('grok down')),
      getName: () => 'Grok',
    };
    const googleEngine: TranslationEngine = {
      ...mockEngine,
      translate: vi.fn().mockResolvedValue('google translated'),
      getName: () => 'Google',
    };

    registry.registerEngine('google-translate', googleEngine);
    registry.registerEngine('grok-translate', grokEngine);
    registry.setUserPreference('user123', 'grok-translate');

    const engine = registry.getEngine('user123');
    const result = await engine.translate({
      text: 'hello',
      sourceLang: 'en',
      targetLang: 'es',
      context: 'ctx'
    });

    expect(result).toBe('google translated');
    expect(grokEngine.translate).toHaveBeenCalledTimes(1);
    expect(googleEngine.translate).toHaveBeenCalledTimes(1);
  });
});