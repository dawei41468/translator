import { TranslationEngine } from './translation-engine.js';
import { logger } from '../../logger.js';
import { LRUCache } from 'lru-cache';

export class GrokTranslateEngine implements TranslationEngine {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private cache: LRUCache<string, string>;

  constructor() {
    this.apiKey = process.env.GROK_API_KEY || '';
    this.baseUrl = (process.env.GROK_API_BASE_URL || 'https://api.x.ai/v1').replace(/\/+$/, '');
    this.model = process.env.GROK_TRANSLATE_MODEL || 'grok-4-1-fast-reasoning';

    this.cache = new LRUCache({
      max: 5000,
      ttl: 1000 * 60 * 60 * 24,
      updateAgeOnGet: true,
    });
  }

  async initialize(): Promise<void> {
    // No-op: uses HTTP API per request.
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  getName(): string {
    return 'Grok (xAI) Translation';
  }

  async translate(params: {
    text: string;
    sourceLang: string;
    targetLang: string;
    context?: string;
  }): Promise<string> {
    const normalizedText = params.text.trim();
    if (!normalizedText) return params.text;

    const cacheKey = `${params.sourceLang}:${params.targetLang}:${normalizedText}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    if (!this.apiKey) {
      throw new Error('GROK_API_KEY is not configured');
    }

    const controller = new AbortController();
    const timeoutMs = 10_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'You are a translation engine. Translate accurately while preserving meaning, tone, idioms, and intent. Output ONLY the translated text (no explanations, no quotes, no extra formatting).',
            },
            {
              role: 'user',
              content: [
                `Translate the following text from ${params.sourceLang} to ${params.targetLang} accurately, preserving tone, idioms, and context.`,
                params.context ? `Context: ${params.context}` : undefined,
                'Text:',
                normalizedText,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        logger.warn('Grok translation request failed', {
          status: response.status,
          statusText: response.statusText,
          bodyText: bodyText?.slice(0, 500),
        });
        throw new Error(`Grok API error: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error('No translation returned from Grok');
      }

      const translatedText = content.trim();
      this.cache.set(cacheKey, translatedText);
      return translatedText;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getSupportedLanguages(): Promise<Array<{ code: string; name: string }>> {
    return [
      { code: 'en', name: 'English' },
      { code: 'zh', name: 'Chinese' },
      { code: 'it', name: 'Italian' },
      { code: 'de', name: 'German' },
      { code: 'nl', name: 'Dutch' },
    ];
  }

  estimateCost(text: string, _sourceLang: string, _targetLang: string): number {
    // Provider pricing may vary; keep an approximate heuristic.
    return text.length * 0.00002;
  }
}
