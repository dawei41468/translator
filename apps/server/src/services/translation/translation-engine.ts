export interface TranslationEngine {
  initialize(): Promise<void>;
  translate(params: {
    text: string;
    sourceLang: string;
    targetLang: string;
    context?: string;
  }): Promise<string>;
  isAvailable(): boolean;
  getName(): string;
  getSupportedLanguages(): Promise<Array<{ code: string; name: string }>>;
  estimateCost(text: string, sourceLang: string, targetLang: string): number;
}