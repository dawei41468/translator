import { translationRegistry } from './registry.js';
import { GrokTranslateEngine } from './grok-translate-engine.js';

translationRegistry.registerEngine('grok-translate', new GrokTranslateEngine());
export { translationRegistry };