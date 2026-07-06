import { SpeakerVoiceSession } from "./voice-session.js";
import { normalizeLang } from "./socket-utils.js";

export interface Participant {
  userId: string;
  language: string;
  displayName?: string | null;
}

export interface OrchestratorEmitters {
  emitText: (participantId: string, data: UtteranceTextPayload) => void;
  emitAudio: (participantId: string, data: UtteranceAudioPayload) => void;
  emitStarted: (participantId: string, data: UtteranceStartedPayload) => void;
  emitDone: (participantId: string, data: UtteranceDonePayload) => void;
  emitError: (participantId: string, data: UtteranceErrorPayload) => void;
}

export interface UtteranceStartedPayload {
  utteranceId: string;
  speakerId: string;
  sourceLang: string;
}

export interface UtteranceTextPayload {
  utteranceId: string;
  text: string;
  lang: string;
  isTranslation: boolean;
}

export interface UtteranceAudioPayload {
  utteranceId: string;
  base64Audio: string;
  targetLang: string;
}

export interface UtteranceDonePayload {
  utteranceId: string;
}

export interface UtteranceErrorPayload {
  utteranceId: string;
  message: string;
}

/**
 * Manages one active utterance in a room: a speaker, listeners, and a set of
 * target-language Voice sessions.
 */
export class UtteranceOrchestrator {
  private utteranceId: string;
  private speakerId: string;
  private sourceLang: string;
  private participants: Participant[];
  private emitters: OrchestratorEmitters;
  private voiceSession: SpeakerVoiceSession;
  private sourceTranscript = "";
  private translationTexts: Map<string, string> = new Map();

  constructor(
    utteranceId: string,
    speakerId: string,
    sourceLang: string,
    participants: Participant[],
    emitters: OrchestratorEmitters
  ) {
    this.utteranceId = utteranceId;
    this.speakerId = speakerId;
    this.sourceLang = normalizeLang(sourceLang);
    this.participants = participants;
    this.emitters = emitters;

    const targetLangs = this.computeTargetLangs();
    this.voiceSession = new SpeakerVoiceSession(this.sourceLang, targetLangs, {
      onSourceTranscript: (text) => this.handleSourceTranscript(text),
      onTranslationText: (text, targetLang) => this.handleTranslationText(text, targetLang),
      onAudioDelta: (base64Audio, targetLang) => this.handleAudioDelta(base64Audio, targetLang),
      onDone: (targetLang) => this.handleDone(targetLang),
      onError: (error, targetLang) => this.handleError(error, targetLang),
    });

    this.broadcastStarted();
  }

  private computeTargetLangs(): string[] {
    const langs = new Set<string>();
    for (const p of this.participants) {
      if (p.userId === this.speakerId) continue;
      const lang = normalizeLang(p.language);
      if (lang !== this.sourceLang) {
        langs.add(lang);
      }
    }
    return Array.from(langs);
  }

  private broadcastStarted() {
    for (const p of this.participants) {
      this.emitters.emitStarted(p.userId, {
        utteranceId: this.utteranceId,
        speakerId: this.speakerId,
        sourceLang: this.sourceLang,
      });
    }
  }

  private handleSourceTranscript(text: string) {
    if (!text || text.trim().length === 0) return;
    this.sourceTranscript = text;

    // Same-language listeners (including the speaker) receive source transcript.
    for (const p of this.participants) {
      const lang = normalizeLang(p.language);
      if (lang === this.sourceLang) {
        this.emitters.emitText(p.userId, {
          utteranceId: this.utteranceId,
          text,
          lang: this.sourceLang,
          isTranslation: false,
        });
      }
    }
  }

  private handleTranslationText(text: string, targetLang: string) {
    if (!text || text.trim().length === 0) return;

    const normalizedTarget = normalizeLang(targetLang);
    const current = this.translationTexts.get(normalizedTarget) || "";
    const next = current + text;
    this.translationTexts.set(normalizedTarget, next);

    for (const p of this.participants) {
      const lang = normalizeLang(p.language);
      if (lang === normalizedTarget) {
        this.emitters.emitText(p.userId, {
          utteranceId: this.utteranceId,
          text: next,
          lang: normalizedTarget,
          isTranslation: true,
        });
      }
    }
  }

  private handleAudioDelta(base64Audio: string, targetLang: string) {
    const normalizedTarget = normalizeLang(targetLang);
    for (const p of this.participants) {
      const lang = normalizeLang(p.language);
      if (lang === normalizedTarget) {
        this.emitters.emitAudio(p.userId, {
          utteranceId: this.utteranceId,
          base64Audio,
          targetLang: normalizedTarget,
        });
      }
    }
  }

  private handleDone(targetLang: string) {
    // When any target session finishes, we don't end the whole utterance because
    // other target languages may still be streaming. In practice, all sessions
    // receive the same input and should finish near the same time.
    // For simplicity, broadcast done to everyone on the first done event.
    for (const p of this.participants) {
      this.emitters.emitDone(p.userId, { utteranceId: this.utteranceId });
    }
  }

  private handleError(error: Error, targetLang: string) {
    for (const p of this.participants) {
      const lang = normalizeLang(p.language);
      if (lang === normalizeLang(targetLang) || lang === this.sourceLang) {
        this.emitters.emitError(p.userId, {
          utteranceId: this.utteranceId,
          message: error.message,
        });
      }
    }
  }

  appendAudio(base64Audio: string) {
    this.voiceSession.appendAudio(base64Audio);
  }

  async stop(): Promise<void> {
    await this.voiceSession.stop();
  }

  async dispose(): Promise<void> {
    await this.voiceSession.dispose();
  }

  getTargetLangs(): string[] {
    return this.voiceSession.getTargetLangs();
  }
}

/**
 * Factory to create unique utterance IDs.
 */
export function generateUtteranceId(): string {
  return `utt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
