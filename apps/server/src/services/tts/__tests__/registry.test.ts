import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TtsEngineRegistry } from '../registry.js';
import { TtsEngine } from '../tts-engine.js';

describe('TtsEngineRegistry', () => {
  let registry: TtsEngineRegistry;
  let mockEngine: TtsEngine;

  beforeEach(() => {
    registry = new TtsEngineRegistry();
    mockEngine = {
      synthesize: vi.fn().mockResolvedValue(Buffer.from('audio')),
      isAvailable: () => true,
      getName: () => 'Mock TTS',
    };
  });

  it('registers and retrieves an engine', () => {
    registry.registerEngine('mock', mockEngine);
    expect(registry.getEngine()).toBe(mockEngine);
  });

  it('returns preferred engine for a user', () => {
    registry.registerEngine('mock', mockEngine);
    registry.setUserPreference('user-1', 'mock');
    expect(registry.getEngine('user-1')).toBe(mockEngine);
  });

  it('falls back to first available engine when preferred is unavailable', () => {
    const unavailable: TtsEngine = { ...mockEngine, isAvailable: () => false };
    registry.registerEngine('preferred', unavailable);
    registry.registerEngine('fallback', mockEngine);
    registry.setUserPreference('user-1', 'preferred');
    expect(registry.getEngine('user-1')).toBe(mockEngine);
  });

  it('throws when no engines are available', () => {
    const unavailable: TtsEngine = { ...mockEngine, isAvailable: () => false };
    registry.registerEngine('unavailable', unavailable);
    expect(() => registry.getEngine()).toThrow('No TTS engine available');
  });

  it('lists available engines', () => {
    registry.registerEngine('mock', mockEngine);
    const available = registry.getAvailableEngines();
    expect(available).toEqual([{ id: 'mock', name: 'Mock TTS' }]);
  });
});
