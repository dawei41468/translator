export interface TtsSynthesizeOptions {
  text: string;
  languageCode: string;
  voiceName?: string;
  ssmlGender?: 'MALE' | 'FEMALE' | 'NEUTRAL' | 'SSML_VOICE_GENDER_UNSPECIFIED';
}

export interface TtsEngine {
  synthesize(options: TtsSynthesizeOptions): Promise<Buffer>;
  isAvailable(): boolean;
  getName(): string;
}
