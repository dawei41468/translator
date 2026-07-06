import { describe, it, expect, vi, beforeEach } from "vitest";
import { UtteranceOrchestrator, generateUtteranceId } from "../utterance-orchestrator.js";

vi.mock("../voice-session.js", () => {
  let lastInstance: MockSpeakerVoiceSession | null = null;

  class MockSpeakerVoiceSession {
    targetLangs: string[] = [];
    appendAudio = vi.fn();
    stop = vi.fn().mockResolvedValue(undefined);
    dispose = vi.fn().mockResolvedValue(undefined);
    getTargetLangs = vi.fn().mockReturnValue([]);

    constructor(sourceLang: string, targetLangs: string[]) {
      this.targetLangs = targetLangs;
      this.getTargetLangs.mockReturnValue(targetLangs);
      lastInstance = this;
    }
  }

  return {
    SpeakerVoiceSession: MockSpeakerVoiceSession,
    __getLastInstance: () => lastInstance,
  };
});

interface MockedSession {
  targetLangs: string[];
  appendAudio: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  getTargetLangs: ReturnType<typeof vi.fn>;
}

describe("UtteranceOrchestrator", () => {
  const emitters = {
    emitText: vi.fn(),
    emitAudio: vi.fn(),
    emitStarted: vi.fn(),
    emitDone: vi.fn(),
    emitError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROK_API_KEY = "test-api-key";
  });

  const createOrchestrator = (participants: { userId: string; language: string }[]) => {
    return new UtteranceOrchestrator(
      generateUtteranceId(),
      "speaker-1",
      "en",
      participants,
      emitters
    );
  };

  it("computes distinct target languages excluding speaker and same-language listeners", () => {
    const orchestrator = createOrchestrator([
      { userId: "speaker-1", language: "en" },
      { userId: "listener-es-1", language: "es" },
      { userId: "listener-es-2", language: "es" },
      { userId: "listener-fr-1", language: "fr" },
    ]);

    expect(orchestrator.getTargetLangs().sort()).toEqual(["es", "fr"]);
  });

  it("broadcasts utterance-started to all participants", () => {
    createOrchestrator([
      { userId: "speaker-1", language: "en" },
      { userId: "listener-es", language: "es" },
    ]);

    expect(emitters.emitStarted).toHaveBeenCalledTimes(2);
    expect(emitters.emitStarted).toHaveBeenCalledWith(
      "speaker-1",
      expect.objectContaining({ speakerId: "speaker-1", sourceLang: "en" })
    );
  });

  it("sends source transcript only to same-language listeners", () => {
    const orchestrator = createOrchestrator([
      { userId: "speaker-1", language: "en" },
      { userId: "listener-en", language: "en" },
      { userId: "listener-es", language: "es" },
    ]);

    const session = (orchestrator as any).voiceSession as MockedSession;
    const handler = (session as any).events?.onSourceTranscript;

    // Manually trigger the event handler we passed to the mock
    const transcriptHandler = (orchestrator as any).handleSourceTranscript.bind(orchestrator);
    transcriptHandler("Hello");

    expect(emitters.emitText).toHaveBeenCalledWith(
      "speaker-1",
      expect.objectContaining({ text: "Hello", lang: "en", isTranslation: false })
    );
    expect(emitters.emitText).toHaveBeenCalledWith(
      "listener-en",
      expect.objectContaining({ text: "Hello", lang: "en", isTranslation: false })
    );
    expect(emitters.emitText).not.toHaveBeenCalledWith(
      "listener-es",
      expect.objectContaining({ isTranslation: false })
    );
  });

  it("sends translated text and audio only to matching cross-language listeners", () => {
    const orchestrator = createOrchestrator([
      { userId: "speaker-1", language: "en" },
      { userId: "listener-es", language: "es" },
      { userId: "listener-fr", language: "fr" },
    ]);

    const translationHandler = (orchestrator as any).handleTranslationText.bind(orchestrator);
    translationHandler("Hola", "es");

    expect(emitters.emitText).toHaveBeenCalledWith(
      "listener-es",
      expect.objectContaining({ text: "Hola", lang: "es", isTranslation: true })
    );
    expect(emitters.emitText).not.toHaveBeenCalledWith(
      "listener-fr",
      expect.objectContaining({ lang: "es" })
    );

    const audioHandler = (orchestrator as any).handleAudioDelta.bind(orchestrator);
    audioHandler("audio-es", "es");

    expect(emitters.emitAudio).toHaveBeenCalledWith(
      "listener-es",
      expect.objectContaining({ base64Audio: "audio-es", targetLang: "es" })
    );
    expect(emitters.emitAudio).not.toHaveBeenCalledWith(
      "listener-fr",
      expect.anything()
    );
  });

  it("does not open audio sessions when all listeners share the speaker language", () => {
    const orchestrator = createOrchestrator([
      { userId: "speaker-1", language: "en" },
      { userId: "listener-en", language: "en" },
    ]);

    expect(orchestrator.getTargetLangs()).toEqual([]);
  });

  it("forwards audio via appendAudio to the voice session", () => {
    const orchestrator = createOrchestrator([
      { userId: "speaker-1", language: "en" },
      { userId: "listener-es", language: "es" },
    ]);

    orchestrator.appendAudio("AAAA");

    const session = (orchestrator as any).voiceSession as MockedSession;
    expect(session.appendAudio).toHaveBeenCalledWith("AAAA");
  });

  it("disposes the voice session on dispose", async () => {
    const orchestrator = createOrchestrator([
      { userId: "speaker-1", language: "en" },
      { userId: "listener-es", language: "es" },
    ]);

    await orchestrator.dispose();

    const session = (orchestrator as any).voiceSession as MockedSession;
    expect(session.dispose).toHaveBeenCalled();
  });
});

describe("generateUtteranceId", () => {
  it("generates unique IDs", () => {
    const id1 = generateUtteranceId();
    const id2 = generateUtteranceId();
    expect(id1).not.toBe(id2);
    expect(id1.startsWith("utt_")).toBe(true);
  });
});
