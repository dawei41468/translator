import { translationRegistry } from './registry.js';
import { GoogleTranslateEngine } from './google-translate-engine.js';
import { GrokTranslateEngine } from './grok-translate-engine.js';

translationRegistry.registerEngine('google-translate', new GoogleTranslateEngine());
translationRegistry.registerEngine('grok-translate', new GrokTranslateEngine());
export { translationRegistry };