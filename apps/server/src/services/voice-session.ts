import { WebSocket } from "ws";
import { logger } from "../logger.js";
import { normalizeLang } from "./socket-utils.js";

const GROK_VOICE_MODEL = "grok-voice-latest";
const GROK_VOICE_WS_URL = "wss://api.x.ai/v1/realtime";
/** Cap buffered audio chunks while a target WS is still connecting. */
const MAX_PENDING_AUDIO_CHUNKS = 40;

export interface VoiceSessionEvents {
  onSourceTranscript: (text: string) => void;
  onTranslationText: (text: string, targetLang: string) => void;
  onAudioDelta: (base64Audio: string, targetLang: string) => void;
  onDone: (targetLang: string) => void;
  onError: (error: Error, targetLang: string) => void;
}

interface TargetSession {
  targetLang: string;
  ws: WebSocket;
  state: "connecting" | "open" | "closed" | "error";
  currentTranslationText: string;
  /** True after at least one translation delta was emitted for this response. */
  emittedTranslationDelta: boolean;
  /** Audio chunks that arrived before the socket was open. */
  pendingAudio: string[];
}

/**
 * Manages one or more Grok Voice realtime sessions for a single active speaker.
 *
 * One target-language session is opened per distinct listener language that differs
 * from the source language. All target sessions receive the same input audio.
 */
export class SpeakerVoiceSession {
  private apiKey: string;
  private sourceLang: string;
  private sessions: Map<string, TargetSession> = new Map();
  private events: VoiceSessionEvents;
  private disposed = false;
  /** Deduplicate identical source transcripts across multi-target sessions. */
  private seenSourceTranscripts = new Set<string>();

  constructor(sourceLang: string, targetLangs: string[], events: VoiceSessionEvents) {
    this.apiKey = process.env.GROK_API_KEY || "";
    this.sourceLang = normalizeLang(sourceLang);
    this.events = events;

    if (!this.apiKey) {
      throw new Error("GROK_API_KEY is not configured");
    }

    const distinctTargets = Array.from(new Set(targetLangs.map(normalizeLang))).filter(
      (lang) => lang !== this.sourceLang
    );

    for (const targetLang of distinctTargets) {
      this.createSession(targetLang);
    }
  }

  private createSession(targetLang: string): TargetSession {
    const wsUrl = new URL(GROK_VOICE_WS_URL);
    wsUrl.searchParams.set("model", GROK_VOICE_MODEL);

    const ws = new WebSocket(wsUrl.toString(), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    const session: TargetSession = {
      targetLang,
      ws,
      state: "connecting",
      currentTranslationText: "",
      emittedTranslationDelta: false,
      pendingAudio: [],
    };

    this.sessions.set(targetLang, session);

    ws.on("open", () => {
      if (this.disposed) return;
      session.state = "open";
      this.configureSession(session);
      this.flushPendingAudio(session);
    });

    ws.on("message", (rawData) => {
      if (this.disposed) return;
      this.handleMessage(session, rawData);
    });

    ws.on("error", (error) => {
      session.state = "error";
      this.events.onError(error, targetLang);
    });

    ws.on("close", () => {
      session.state = "closed";
      session.pendingAudio = [];
    });

    return session;
  }

  private flushPendingAudio(session: TargetSession) {
    if (session.state !== "open" || session.pendingAudio.length === 0) return;

    for (const base64Audio of session.pendingAudio) {
      try {
        session.ws.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64Audio,
        }));
      } catch {
        // ignore per-chunk failures
      }
    }
    session.pendingAudio = [];
  }

  private configureSession(session: TargetSession) {
    const sourceName = this.getLangName(this.sourceLang);
    const targetName = this.getLangName(session.targetLang);

    const instructions =
      `You are a real-time translator in a group conversation. ` +
      `The speaker is speaking in ${sourceName}. ` +
      `Listen carefully, transcribe what they say in ${sourceName}, ` +
      `and translate it accurately into natural, conversational ${targetName}. ` +
      `Speak ONLY the ${targetName} translation back. ` +
      `Do not add commentary or explanations. ` +
      `Keep it concise and match the speaker's tone.`;

    const message = {
      type: "session.update",
      session: {
        voice: "eve",
        instructions,
        turn_detection: { type: "server_vad" },
      },
    };

    session.ws.send(JSON.stringify(message));
  }

  private getLangName(code: string): string {
    const names: Record<string, string> = {
      en: "English",
      zh: "Chinese",
      es: "Spanish",
      it: "Italian",
      fr: "French",
      de: "German",
      ja: "Japanese",
      ko: "Korean",
      pt: "Portuguese",
      ru: "Russian",
      nl: "Dutch",
    };
    return names[code] || code;
  }

  private handleMessage(session: TargetSession, rawData: WebSocket.RawData) {
    try {
      const data = JSON.parse(rawData.toString());

      if (data.type === "conversation.item.input_audio_transcription.completed" && data.transcript) {
        // Multi-target sessions receive the same source completion — emit once.
        if (!this.seenSourceTranscripts.has(data.transcript)) {
          this.seenSourceTranscripts.add(data.transcript);
          this.events.onSourceTranscript(data.transcript);
        }
      }

      if (data.type === "response.output_audio_transcript.delta" && data.transcript) {
        session.currentTranslationText += data.transcript;
        session.emittedTranslationDelta = true;
        this.events.onTranslationText(data.transcript, session.targetLang);
      }

      if (data.type === "response.output_audio_transcript.done" && data.transcript) {
        session.currentTranslationText = data.transcript;
        // Deltas already streamed the text. Only emit on done when no deltas arrived
        // (some providers send a single full transcript at the end).
        if (!session.emittedTranslationDelta) {
          this.events.onTranslationText(data.transcript, session.targetLang);
        }
        session.emittedTranslationDelta = false;
      }

      if (data.type === "response.output_audio.delta" && data.delta) {
        this.events.onAudioDelta(data.delta, session.targetLang);
      }

      if (data.type === "input_audio_buffer.speech_started") {
        session.currentTranslationText = "";
        session.emittedTranslationDelta = false;
      }

      if (data.type === "response.done") {
        this.events.onDone(session.targetLang);
      }

      if (data.type === "error") {
        const message = data.error?.message || data.message || "Grok Voice session error";
        this.events.onError(new Error(message), session.targetLang);
      }
    } catch (error) {
      logger.warn("Failed to parse Grok Voice message", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Append base64-encoded PCM16 audio to every target-language session.
   * Chunks that arrive while a session is still connecting are buffered and flushed on open.
   */
  appendAudio(base64Audio: string) {
    if (this.disposed) return;

    const message = JSON.stringify({
      type: "input_audio_buffer.append",
      audio: base64Audio,
    });

    for (const session of this.sessions.values()) {
      if (session.state === "open") {
        session.ws.send(message);
      } else if (session.state === "connecting") {
        if (session.pendingAudio.length < MAX_PENDING_AUDIO_CHUNKS) {
          session.pendingAudio.push(base64Audio);
        }
      }
    }
  }

  /**
   * Commit the audio buffer and close each target session gracefully.
   */
  async stop(): Promise<void> {
    if (this.disposed) return;

    for (const session of this.sessions.values()) {
      if (session.state === "open") {
        try {
          // Flush any remaining buffer before commit
          this.flushPendingAudio(session);
          session.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        } catch {
          // ignore
        }
      }
    }

    // Give the model a moment to flush final deltas before closing.
    await new Promise((resolve) => setTimeout(resolve, 500));

    await this.dispose();
  }

  /**
   * Close all target sessions and clean up.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    for (const session of this.sessions.values()) {
      try {
        session.ws.close();
      } catch {
        // ignore
      }
      session.pendingAudio = [];
    }

    this.sessions.clear();
    this.seenSourceTranscripts.clear();
  }

  getTargetLangs(): string[] {
    return Array.from(this.sessions.keys());
  }

  getOpenCount(): number {
    return Array.from(this.sessions.values()).filter((s) => s.state === "open").length;
  }
}
