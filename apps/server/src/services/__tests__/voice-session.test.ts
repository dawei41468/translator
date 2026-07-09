import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpeakerVoiceSession } from "../voice-session.js";

interface MockWebSocketLike {
  url: string;
  protocol: string;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on: (event: string, handler: any) => void;
  emitMessage: (data: string | Buffer) => void;
}

const mockInstances: MockWebSocketLike[] = [];

vi.mock("ws", () => {
  const instances: MockWebSocketLike[] = [];

  class MockWebSocket {
    readyState = 1;
    protocol = "";
    url = "";
    private messageHandlers: ((data: Buffer) => void)[] = [];
    private openHandlers: (() => void)[] = [];
    private closeHandler?: () => void;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = 3;
      this.closeHandler?.();
    });

    constructor(url: string, protocols?: string | string[]) {
      this.url = url;
      this.protocol = Array.isArray(protocols) ? protocols[0] : protocols || "";
      const self = this as unknown as MockWebSocketLike;
      instances.push(self);
      mockInstances.push(self);
      setTimeout(() => this.openHandlers.forEach((h) => h()), 0);
    }

    on(event: string, handler: any) {
      if (event === "message") this.messageHandlers.push(handler);
      if (event === "open") this.openHandlers.push(handler);
      if (event === "close") this.closeHandler = handler;
    }

    emitMessage(data: string | Buffer) {
      const buffer = typeof data === "string" ? Buffer.from(data) : data;
      this.messageHandlers.forEach((h) => h(buffer));
    }
  }

  return { WebSocket: MockWebSocket };
});

describe("SpeakerVoiceSession", () => {
  const events = {
    onSourceTranscript: vi.fn(),
    onTranslationText: vi.fn(),
    onAudioDelta: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockInstances.length = 0;
    process.env.GROK_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete process.env.GROK_API_KEY;
  });

  it("throws if GROK_API_KEY is missing", () => {
    delete process.env.GROK_API_KEY;
    expect(() => new SpeakerVoiceSession("en", ["es"], events)).toThrow("GROK_API_KEY");
  });

  it("opens one session per distinct target language", () => {
    new SpeakerVoiceSession("en", ["es", "fr", "es"], events);
    expect(mockInstances.length).toBe(2);
  });

  it("does not open a session when target equals source language", () => {
    new SpeakerVoiceSession("en", ["en", "es", "en"], events);
    expect(mockInstances.length).toBe(1);
  });

  it("forwards append audio to all open sessions", async () => {
    const session = new SpeakerVoiceSession("en", ["es", "fr"], events);
    await new Promise((resolve) => setTimeout(resolve, 10));

    session.appendAudio("AAAA");

    const audioMessages = mockInstances
      .flatMap((instance) => instance.send.mock.calls)
      .filter((call) => {
        const data = JSON.parse(call[0] as string);
        return data.type === "input_audio_buffer.append";
      });

    expect(audioMessages.length).toBe(2);
  });

  it("sends session.update on open", async () => {
    new SpeakerVoiceSession("en", ["es"], events);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const configMessages = mockInstances[0]!.send.mock.calls.filter((call) => {
      const data = JSON.parse(call[0] as string);
      return data.type === "session.update";
    });

    expect(configMessages.length).toBe(1);
    const payload = JSON.parse(configMessages[0]![0] as string);
    expect(payload.type).toBe("session.update");
    expect(payload.session.voice).toBe("eve");
    expect(payload.session.instructions).toContain("English");
    expect(payload.session.instructions).toContain("Spanish");
    expect(payload.session.turn_detection).toEqual({
      type: "server_vad",
    });
  });

  it("emits source transcript from input audio transcription event", async () => {
    new SpeakerVoiceSession("en", ["es"], events);
    await new Promise((resolve) => setTimeout(resolve, 10));

    mockInstances[0]!.emitMessage(
      JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Hello world",
      })
    );

    expect(events.onSourceTranscript).toHaveBeenCalledWith("Hello world");
  });

  it("emits translation text and audio delta for the correct target language", async () => {
    new SpeakerVoiceSession("en", ["es"], events);
    await new Promise((resolve) => setTimeout(resolve, 10));

    mockInstances[0]!.emitMessage(
      JSON.stringify({
        type: "response.output_audio_transcript.delta",
        transcript: "Hola",
      })
    );

    mockInstances[0]!.emitMessage(
      JSON.stringify({
        type: "response.output_audio.delta",
        delta: "audio-data",
      })
    );

    expect(events.onTranslationText).toHaveBeenCalledWith("Hola", "es");
    expect(events.onAudioDelta).toHaveBeenCalledWith("audio-data", "es");
  });

  it("emits done event when response completes", async () => {
    new SpeakerVoiceSession("en", ["es"], events);
    await new Promise((resolve) => setTimeout(resolve, 10));

    mockInstances[0]!.emitMessage(JSON.stringify({ type: "response.done" }));

    expect(events.onDone).toHaveBeenCalledWith("es");
  });

  it("closes all sessions on dispose", async () => {
    const session = new SpeakerVoiceSession("en", ["es", "fr"], events);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await session.dispose();

    expect(mockInstances[0]!.close).toHaveBeenCalled();
    expect(mockInstances[1]!.close).toHaveBeenCalled();
  });
});
