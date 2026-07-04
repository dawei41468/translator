import { SpeechEngineRegistry } from './registry';
import { GrokSttEngine } from './grok-stt';
import { GrokTtsEngine } from './grok-tts';
import { MockSttEngine, MockTtsEngine } from './mock-engines';

export function createSpeechEngineRegistry(preferences?: {
  stt?: string;
  tts?: string;
  translation?: string;
  ttsVoice?: string;
}) {
  const registry = new SpeechEngineRegistry(preferences);

  const useMocks = import.meta.env.MODE === 'test';

  if (useMocks) {
    registry.registerSttEngine('grok-stt', new MockSttEngine());
    registry.registerTtsEngine('grok-tts', new MockTtsEngine());
    registry.registerSttEngine('mock-stt', new MockSttEngine());
    registry.registerTtsEngine('mock-tts', new MockTtsEngine());
  } else {
    registry.registerSttEngine('grok-stt', new GrokSttEngine());
    registry.registerTtsEngine('grok-tts', new GrokTtsEngine(preferences?.ttsVoice));
  }

  return registry;
}
