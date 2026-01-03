import speech from "@google-cloud/speech";
import { logger } from "../logger.js";

let speechClient: speech.SpeechClient | null = null;

function getSpeechClient() {
  if (!speechClient) {
    speechClient = new speech.SpeechClient();
  }
  return speechClient;
}

export interface STTConfig {
  languageCode: string;
  encoding?: "WEBM_OPUS" | "LINEAR16";
  sampleRateHertz?: number;
}

export function createRecognizeStream(
  config: STTConfig,
  onData: (text: string, isFinal: boolean) => void,
  onError: (error: any) => void
) {
  const request = {
    config: {
      encoding: config.encoding || "WEBM_OPUS",
      sampleRateHertz: config.sampleRateHertz || 48000,
      languageCode: config.languageCode,
      enableAutomaticPunctuation: true,
    },
    interimResults: true,
  };

  try {
    const recognizeStream = getSpeechClient()
      .streamingRecognize(request as any)
      .on("error", (error) => {
        logger.error("STT Stream error", error);
        onError(error);
      })
      .on("data", (data) => {
        if (data.results[0] && data.results[0].alternatives[0]) {
          const result = data.results[0];
          const transcript = result.alternatives[0].transcript;
          const isFinal = result.isFinal;
          onData(transcript, isFinal);
        }
      });

    return recognizeStream;
  } catch (error) {
    logger.error("Failed to create STT stream", error);
    throw error;
  }
}
