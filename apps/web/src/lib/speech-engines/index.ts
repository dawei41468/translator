import { SpeechEngineRegistry } from './registry';
import { GoogleCloudSttEngine } from './google-cloud-stt';
import { GoogleCloudTtsEngine } from './google-cloud-tts';
import { MockSttEngine, MockTtsEngine } from './mock-engines';

export function createSpeechEngineRegistry(preferences?: { stt?: string; tts?: string; translation?: string }) {
  const registry = new SpeechEngineRegistry(preferences);

  const useMocks = import.meta.env.VITE_USE_MOCKS === 'true' || import.meta.env.MODE === 'test';

  if (useMocks) {
    registry.registerSttEngine('google-cloud-stt', new MockSttEngine());
    registry.registerTtsEngine('google-cloud', new MockTtsEngine());
    // Also register them with their own IDs if preferred
    registry.registerSttEngine('mock-stt', new MockSttEngine());
    registry.registerTtsEngine('mock-tts', new MockTtsEngine());
  } else {
    registry.registerSttEngine('google-cloud-stt', new GoogleCloudSttEngine());
    registry.registerTtsEngine('google-cloud', new GoogleCloudTtsEngine());
  }

  return registry;
}