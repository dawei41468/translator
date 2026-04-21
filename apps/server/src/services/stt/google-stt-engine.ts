import { SttEngine, type SttConfig } from './stt-engine.js';
import { createRecognizeStream } from '../stt.js';

export class GoogleSttEngine implements SttEngine {
  private stream: any = null;
  private transcriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private endCallback: (() => void) | null = null;
  private closeCallback: (() => void) | null = null;

  isAvailable(): boolean {
    return true;
  }

  getName(): string {
    return 'Google Cloud STT';
  }

  start(config: SttConfig): void {
    this.stream = createRecognizeStream(
      config,
      (text, isFinal) => {
        this.transcriptCallback?.(text, isFinal);
      },
      (error) => {
        this.errorCallback?.(error instanceof Error ? error : new Error(String(error)));
      }
    );

    this.stream.on('end', () => {
      this.endCallback?.();
    });

    this.stream.on('close', () => {
      this.closeCallback?.();
    });
  }

  write(chunk: Buffer): void {
    if (this.stream) {
      this.stream.write(chunk);
    }
  }

  end(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
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
