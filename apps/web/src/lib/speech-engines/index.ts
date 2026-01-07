import { SpeechEngineRegistry } from './registry';
import { GoogleCloudSttEngine } from './google-cloud-stt';
import { GoogleCloudTtsEngine } from './google-cloud-tts';

export function createSpeechEngineRegistry(preferences?: { stt?: string; tts?: string; translation?: string }) {
  const registry = new SpeechEngineRegistry(preferences);

  registry.registerSttEngine('google-cloud-stt', new GoogleCloudSttEngine());
  registry.registerTtsEngine('google-cloud', new GoogleCloudTtsEngine());

  return registry;
}