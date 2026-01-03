import { TranslationServiceClient } from "@google-cloud/translate";
import { logger } from "../logger.js";

let translationClient: TranslationServiceClient | null = null;

const SUPPORTED_TRANSLATION_LOCATIONS = new Set(["global", "us-central1"]);

function getTranslationLocation(): string {
  const raw =
    process.env.GOOGLE_CLOUD_TRANSLATE_LOCATION ??
    process.env.GOOGLE_CLOUD_LOCATION ??
    "global";

  const location = raw.trim();
  if (SUPPORTED_TRANSLATION_LOCATIONS.has(location)) return location;

  logger.warn("Unsupported Google Translation location; falling back to global", {
    location,
  });
  return "global";
}

function getTranslationClient() {
  if (!translationClient) {
    translationClient = new TranslationServiceClient();
  }
  return translationClient;
}

export async function translateText(text: string, sourceLang: string, targetLang: string): Promise<string> {
  try {
    const normalizedText = text.trim();
    if (!normalizedText) return text;

    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    if (!projectId) {
      throw new Error("GOOGLE_CLOUD_PROJECT_ID not configured");
    }

    const location = getTranslationLocation(); // Hong Kong region

    const request = {
      parent: `projects/${projectId}/locations/${location}`,
      contents: [normalizedText],
      mimeType: "text/plain",
      sourceLanguageCode: sourceLang,
      targetLanguageCode: targetLang,
    };

    const [response] = await getTranslationClient().translateText(request);

    if (!response.translations || response.translations.length === 0) {
      throw new Error("No translation returned");
    }

    return response.translations[0].translatedText || text;
  } catch (error) {
    logger.error("Translation error", error, { text, sourceLang, targetLang });
    // Fallback: return original text
    return text;
  }
}