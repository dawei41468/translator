export interface SttConfig {
  languageCode: string;
  encoding?: "WEBM_OPUS" | "LINEAR16";
  sampleRateHertz?: number;
}

export interface SttEngine {
  start(config: SttConfig): void;
  write(chunk: Buffer): void;
  end(): void;
  onTranscript(callback: (text: string, isFinal: boolean) => void): void;
  onError(callback: (error: Error) => void): void;
  onEnd(callback: () => void): void;
  onClose(callback: () => void): void;
  destroy(): void;
  isAvailable(): boolean;
  getName(): string;
}
