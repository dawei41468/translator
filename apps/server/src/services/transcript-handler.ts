import { TranslationEngine } from './translation/translation-engine.js';
import { withRetry, normalizeLang } from './socket-utils.js';

export interface Participant {
  userId: string;
  user: {
    displayName?: string | null;
    name?: string | null;
    language?: string | null;
  };
}

export async function handleTranscript(params: {
  transcript: string;
  sourceLang: string;
  roomId: string;
  userId: string;
  soloMode: boolean;
  soloTargetLang?: string;
  translationEngine: TranslationEngine;
  getParticipants: (roomId: string) => Promise<Participant[]>;
  emitToRoom: (participantId: string, event: string, data: any) => void;
  emitToSelf: (event: string, data: any) => void;
  logInfo?: (msg: string, ctx?: any) => void;
  logWarn?: (msg: string, ctx?: any) => void;
  logError?: (msg: string, ctx?: any) => void;
}): Promise<void> {
  const {
    transcript,
    sourceLang,
    roomId,
    userId,
    soloMode,
    soloTargetLang,
    translationEngine,
    getParticipants,
    emitToRoom,
    emitToSelf,
    logInfo,
    logWarn,
    logError,
  } = params;

  // Ignore empty or whitespace-only transcripts (can come from STT on silence, noise, or very short audio)
  if (!transcript || transcript.trim().length === 0) {
    return;
  }

  const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const normalizedSourceLang = normalizeLang(sourceLang);

  const participants = await withRetry(
    () => getParticipants(roomId),
    2,
    500
  );

  const speaker = participants.find((p) => p.userId === userId);
  const speakerName = speaker?.user?.displayName || speaker?.user?.name || "Unknown User";

  const otherParticipants = participants.filter((p) => p.userId !== userId);
  if (otherParticipants.length === 0 && !soloMode) return;

  const participantsByLanguage = new Map<string, typeof otherParticipants>();
  const sameLanguageParticipants: typeof otherParticipants = [];

  for (const participant of otherParticipants) {
    const lang = normalizeLang(participant.user.language || "en");

    if (lang === normalizedSourceLang) {
      sameLanguageParticipants.push(participant);
      continue;
    }

    if (!participantsByLanguage.has(lang)) {
      participantsByLanguage.set(lang, []);
    }
    participantsByLanguage.get(lang)!.push(participant);
  }

  for (const participant of sameLanguageParticipants) {
    emitToRoom(participant.userId, "translated-message", {
      originalText: transcript,
      translatedText: transcript,
      sourceLang: normalizedSourceLang,
      targetLang: normalizedSourceLang,
      fromUserId: userId,
      toUserId: participant.userId,
      speakerName,
    });
  }

  if (participantsByLanguage.size > 0) {
    const translationPromises = Array.from(participantsByLanguage.entries()).map(
      async ([targetLang, participants]) => {
        try {
          const translatedText = await withRetry(
            () =>
              translationEngine.translate({
                text: transcript,
                sourceLang: normalizedSourceLang,
                targetLang,
                context: `Room: ${roomId}`,
              }),
            2,
            1000
          );
          return { targetLang, translatedText, participants, success: true as const };
        } catch (error) {
          return { targetLang, participants, error, success: false as const };
        }
      }
    );

    const translations = await Promise.all(translationPromises);

    for (const result of translations) {
      if (result.success) {
        const { targetLang, translatedText, participants } = result;
        for (const participant of participants) {
          emitToRoom(participant.userId, "translated-message", {
            id: messageId,
            originalText: transcript,
            translatedText,
            sourceLang: normalizedSourceLang,
            targetLang,
            fromUserId: userId,
            toUserId: participant.userId,
            speakerName,
          });
        }
      } else {
        logWarn?.("Translation failed for language group", {
          userId,
          roomId,
          error: result.error,
          targetLang: result.targetLang,
        });
      }
    }
  }

  emitToSelf("recognized-speech", {
    id: messageId,
    text: transcript,
    sourceLang: normalizedSourceLang,
    speakerName,
  });

  if (soloMode && soloTargetLang) {
    logInfo?.("Starting solo translation", {
      userId,
      roomId,
      targetLang: soloTargetLang,
    });

    try {
      const translatedText = await withRetry(
        () =>
          translationEngine.translate({
            text: transcript,
            sourceLang: normalizedSourceLang,
            targetLang: soloTargetLang,
            context: `Solo mode - Room: ${roomId}`,
          }),
        2,
        1000
      );

      logInfo?.("Solo translation success", {
        userId,
        roomId,
        translatedText: translatedText.substring(0, 100),
      });

      logInfo?.("Emitting solo-translated", {
        userId,
        roomId,
        messageId,
      });

      emitToSelf("solo-translated", {
        id: messageId,
        originalText: transcript,
        translatedText,
        sourceLang,
        targetLang: soloTargetLang,
        speakerName,
      });
    } catch (error) {
      logError?.("Solo translation failed", {
        userId,
        roomId,
        error: error instanceof Error ? error.message : String(error),
        transcript: transcript.substring(0, 100),
      });
      throw error;
    }
  }
}
