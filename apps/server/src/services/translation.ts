import { TranslationServiceClient } from "@google-cloud/translate";
import { logger } from "../logger.js";

let translationClient: TranslationServiceClient | null = null;

function getTranslationClient() {
  if (!translationClient) {
    translationClient = new TranslationServiceClient();
  }
  return translationClient;
}

export async function translateText(text: string, sourceLang: string, targetLang: string): Promise<string> {
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    if (!projectId) {
      throw new Error("GOOGLE_CLOUD_PROJECT_ID not configured");
    }

    const location = "asia-east2"; // Hong Kong region

    const request = {
      parent: `projects/${projectId}/locations/${location}`,
      contents: [text],
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