import { SpeechEngineRegistry } from './registry';
import { WebSpeechSttEngine } from './web-speech-stt';
import { WebSpeechTtsEngine } from './web-speech-tts';
import { GoogleCloudTtsEngine } from './google-cloud-tts';

export function createSpeechEngineRegistry(preferences?: { stt?: string; tts?: string; translation?: string }) {
  const registry = new SpeechEngineRegistry(preferences);

  registry.registerSttEngine('web-speech-api', new WebSpeechSttEngine());
  registry.registerTtsEngine('web-speech-api', new WebSpeechTtsEngine());
  registry.registerTtsEngine('google-cloud', new GoogleCloudTtsEngine());

  return registry;
}