import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpeechEngineRegistry } from '../registry';
import { SttEngine, TtsEngine } from '../types';

describe('SpeechEngineRegistry', () => {
  let registry: SpeechEngineRegistry;
  let mockSttEngine: SttEngine;
  let mockTtsEngine: TtsEngine;

  beforeEach(() => {
    registry = new SpeechEngineRegistry();

    mockSttEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      startRecognition: vi.fn().mockResolvedValue({}),
      stopRecognition: vi.fn().mockResolvedValue(undefined),
      isAvailable: () => true,
      getName: () => 'Mock STT Engine'
    };

    mockTtsEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      speak: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      isAvailable: () => true,
      getVoices: vi.fn().mockResolvedValue([]),
      getName: () => 'Mock TTS Engine'
    };
  });

  it('should register and retrieve STT engines', () => {
    registry.registerSttEngine('mock-stt', mockSttEngine);
    expect(registry.getSttEngine()).toBe(mockSttEngine);
  });

  it('should register and retrieve TTS engines', () => {
    registry.registerTtsEngine('mock-tts', mockTtsEngine);
    expect(registry.getTtsEngine()).toBe(mockTtsEngine);
  });

  it('should return available engines list', () => {
    registry.registerSttEngine('mock-stt', mockSttEngine);
    registry.registerTtsEngine('mock-tts', mockTtsEngine);

    const availableStt = registry.getAvailableSttEngines();
    const availableTts = registry.getAvailableTtsEngines();

    expect(availableStt).toHaveLength(1);
    expect(availableStt[0]).toEqual({ id: 'mock-stt', name: 'Mock STT Engine' });

    expect(availableTts).toHaveLength(1);
    expect(availableTts[0]).toEqual({ id: 'mock-tts', name: 'Mock TTS Engine' });
  });

  it('should accept engine preferences in constructor', () => {
    const registryWithPrefs = new SpeechEngineRegistry({
      stt: 'mock-stt',
      tts: 'mock-tts'
    });

    registryWithPrefs.registerSttEngine('mock-stt', mockSttEngine);
    registryWithPrefs.registerTtsEngine('mock-tts', mockTtsEngine);

    // Should return the preferred engines
    expect(registryWithPrefs.getSttEngine()).toBe(mockSttEngine);
    expect(registryWithPrefs.getTtsEngine()).toBe(mockTtsEngine);
  });

  it('should fallback to available engine when preferred engine is not available', () => {
    const unavailableEngine: SttEngine = {
      ...mockSttEngine,
      isAvailable: () => false
    };

    const registryWithPrefs = new SpeechEngineRegistry({ stt: 'unavailable' });
    registryWithPrefs.registerSttEngine('unavailable', unavailableEngine);
    registryWithPrefs.registerSttEngine('fallback', mockSttEngine);

    // Should return fallback engine since preferred is unavailable
    const engine = registryWithPrefs.getSttEngine();
    expect(engine).toBe(mockSttEngine);
  });

  it('should throw error when no engines are available', () => {
    const unavailableEngine: SttEngine = {
      ...mockSttEngine,
      isAvailable: () => false
    };

    registry.registerSttEngine('unavailable', unavailableEngine);

    expect(() => registry.getSttEngine()).toThrow('No STT engine available');
  });
});