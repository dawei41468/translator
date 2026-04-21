import { SpeechEngineRegistry } from './registry';
import { GoogleCloudSttEngine } from './google-cloud-stt';
import { GoogleCloudTtsEngine } from './google-cloud-tts';
import { GrokSttEngine } from './grok-stt';
import { GrokTtsEngine } from './grok-tts';
import { MockSttEngine, MockTtsEngine } from './mock-engines';

export function createSpeechEngineRegistry(preferences?: { stt?: string; tts?: string; translation?: string }) {
  const registry = new SpeechEngineRegistry(preferences);

  const useMocks = import.meta.env.MODE === 'test';

  if (useMocks) {
    registry.registerSttEngine('google-cloud-stt', new MockSttEngine());
    registry.registerTtsEngine('google-cloud', new MockTtsEngine());
    registry.registerSttEngine('grok-stt', new MockSttEngine());
    registry.registerTtsEngine('grok-tts', new MockTtsEngine());
    registry.registerSttEngine('mock-stt', new MockSttEngine());
    registry.registerTtsEngine('mock-tts', new MockTtsEngine());
  } else {
    registry.registerSttEngine('google-cloud-stt', new GoogleCloudSttEngine());
    registry.registerTtsEngine('google-cloud', new GoogleCloudTtsEngine());
    registry.registerSttEngine('grok-stt', new GrokSttEngine());
    registry.registerTtsEngine('grok-tts', new GrokTtsEngine());
  }

  return registry;
}
