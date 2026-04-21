import WebSocket from 'ws';
import { SttEngine, type SttConfig } from './stt-engine.js';
import { logger } from '../../logger.js';

function getWsUrl(): string {
  const baseUrl = process.env.GROK_API_BASE_URL || 'https://api.x.ai/v1';
  return baseUrl.replace(/^https/, 'wss') + '/stt';
}

function mapEncoding(encoding?: string): string {
  switch (encoding) {
    case 'WEBM_OPUS':
      return 'opus';
    case 'LINEAR16':
      return 'pcm';
    default:
      return 'opus';
  }
}

export class GrokSttEngine implements SttEngine {
  private ws: WebSocket | null = null;
  private transcriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private endCallback: (() => void) | null = null;
  private closeCallback: (() => void) | null = null;
  private config: SttConfig | null = null;
  private isOpen = false;
  private pendingChunks: Buffer[] = [];

  isAvailable(): boolean {
    return !!process.env.GROK_API_KEY;
  }

  getName(): string {
    return 'Grok STT';
  }

  start(config: SttConfig): void {
    this.config = config;
    this.isOpen = false;
    this.pendingChunks = [];

    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey) {
      this.errorCallback?.(new Error('GROK_API_KEY is not configured'));
      return;
    }

    try {
      const url = getWsUrl();
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      this.ws.on('open', () => {
        this.isOpen = true;
        this.ws?.send(
          JSON.stringify({
            model: 'grok-stt',
            language: config.languageCode.split('-')[0],
            encoding: mapEncoding(config.encoding),
            sample_rate: config.sampleRateHertz || 48000,
          })
        );

        // Flush any chunks that arrived before open
        for (const chunk of this.pendingChunks) {
          this.ws?.send(chunk);
        }
        this.pendingChunks = [];
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'transcript' || message.text !== undefined) {
            const text = message.text || message.transcript || '';
            const isFinal = message.is_final === true;
            this.transcriptCallback?.(text, isFinal);
          }
        } catch {
          // Ignore non-JSON messages
        }
      });

      this.ws.on('error', (err) => {
        logger.error('Grok STT WebSocket error', { error: err.message });
        this.errorCallback?.(err);
      });

      this.ws.on('close', () => {
        this.isOpen = false;
        this.ws = null;
        this.closeCallback?.();
      });

      this.ws.on('end', () => {
        this.endCallback?.();
      });
    } catch (err) {
      this.errorCallback?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  write(chunk: Buffer): void {
    if (!this.ws) return;
    if (this.isOpen) {
      this.ws.send(chunk);
    } else {
      this.pendingChunks.push(chunk);
    }
  }

  end(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.isOpen = false;
    this.pendingChunks = [];
  }

  onTranscript(callback: (text: string, isFinal: boolean) => void): void {
    this.transcriptCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }

  onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  destroy(): void {
    this.end();
  }
}
