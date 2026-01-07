import { translationRegistry } from './registry.js';
import { GoogleTranslateEngine } from './google-translate-engine.js';

translationRegistry.registerEngine('google-translate', new GoogleTranslateEngine());
export { translationRegistry };