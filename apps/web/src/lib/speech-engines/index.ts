import { SpeechEngineRegistry } from './registry';
import { WebSpeechSttEngine } from './web-speech-stt';
import { GoogleCloudSttEngine } from './google-cloud-stt';
import { WebSpeechTtsEngine } from './web-speech-tts';
import { GoogleCloudTtsEngine } from './google-cloud-tts';

export function createSpeechEngineRegistry(preferences?: { stt?: string; tts?: string; translation?: string }) {
  const registry = new SpeechEngineRegistry(preferences);

  registry.registerSttEngine('web-speech-api', new WebSpeechSttEngine());
  registry.registerSttEngine('google-cloud-stt', new GoogleCloudSttEngine());
  registry.registerTtsEngine('web-speech-api', new WebSpeechTtsEngine());
  registry.registerTtsEngine('google-cloud', new GoogleCloudTtsEngine());

  return registry;
}