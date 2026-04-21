import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SttEngineRegistry } from '../registry.js';
import { SttEngine } from '../stt-engine.js';

describe('SttEngineRegistry', () => {
  let registry: SttEngineRegistry;
  let mockEngine: SttEngine;

  beforeEach(() => {
    registry = new SttEngineRegistry();
    mockEngine = {
      start: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
      onClose: vi.fn(),
      destroy: vi.fn(),
      isAvailable: () => true,
      getName: () => 'Mock STT',
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
    const unavailable: SttEngine = { ...mockEngine, isAvailable: () => false };
    registry.registerEngine('preferred', unavailable);
    registry.registerEngine('fallback', mockEngine);
    registry.setUserPreference('user-1', 'preferred');
    expect(registry.getEngine('user-1')).toBe(mockEngine);
  });

  it('throws when no engines are available', () => {
    const unavailable: SttEngine = { ...mockEngine, isAvailable: () => false };
    registry.registerEngine('unavailable', unavailable);
    expect(() => registry.getEngine()).toThrow('No STT engine available');
  });

  it('lists available engines', () => {
    registry.registerEngine('mock', mockEngine);
    const available = registry.getAvailableEngines();
    expect(available).toEqual([{ id: 'mock', name: 'Mock STT' }]);
  });
});
