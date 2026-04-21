import { describe, it, expect, vi, beforeEach } from 'vitest';
import WebSocket from 'ws';
import { GrokSttEngine } from '../grok-stt-engine.js';

vi.mock('ws', () => ({
  default: vi.fn().mockImplementation(function() {
    return {
      on: vi.fn().mockReturnThis(),
      send: vi.fn(),
      close: vi.fn(),
    };
  }),
}));

describe('GrokSttEngine', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('isAvailable returns true when api key is set', () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokSttEngine();
    expect(engine.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when api key is missing', () => {
    delete process.env.GROK_API_KEY;
    const engine = new GrokSttEngine();
    expect(engine.isAvailable()).toBe(false);
  });

  it('getName returns Grok STT', () => {
    const engine = new GrokSttEngine();
    expect(engine.getName()).toBe('Grok STT');
  });

  it('start connects websocket and sends config on open', () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokSttEngine();
    const mockWs = {
      on: vi.fn().mockReturnThis(),
      send: vi.fn(),
      close: vi.fn(),
    };
    (WebSocket as any).mockImplementation(function() { return mockWs; });

    engine.start({ languageCode: 'en-US', encoding: 'WEBM_OPUS', sampleRateHertz: 48000 });

    expect(WebSocket).toHaveBeenCalledWith(
      'wss://api.x.ai/v1/stt',
      expect.objectContaining({
        headers: { Authorization: 'Bearer key' },
      })
    );

    const openHandler = mockWs.on.mock.calls.find((c: any[]) => c[0] === 'open')?.[1];
    openHandler?.();

    expect(mockWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"model":"grok-stt"')
    );
  });

  it('buffers chunks before websocket opens', () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokSttEngine();
    const mockWs = {
      on: vi.fn().mockReturnThis(),
      send: vi.fn(),
      close: vi.fn(),
    };
    (WebSocket as any).mockImplementation(function() { return mockWs; });

    engine.start({ languageCode: 'en-US' });
    const chunk = Buffer.from('audio');
    engine.write(chunk);

    expect(mockWs.send).not.toHaveBeenCalledWith(chunk);

    const openHandler = mockWs.on.mock.calls.find((c: any[]) => c[0] === 'open')?.[1];
    openHandler?.();

    expect(mockWs.send).toHaveBeenCalledWith(chunk);
  });

  it('emits transcript on message', () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokSttEngine();
    const transcriptCb = vi.fn();
    engine.onTranscript(transcriptCb);

    const mockWs = {
      on: vi.fn().mockReturnThis(),
      send: vi.fn(),
      close: vi.fn(),
    };
    (WebSocket as any).mockImplementation(function() { return mockWs; });

    engine.start({ languageCode: 'en-US' });

    const messageHandler = mockWs.on.mock.calls.find((c: any[]) => c[0] === 'message')?.[1];
    messageHandler?.(Buffer.from(JSON.stringify({ text: 'hello', is_final: true })));

    expect(transcriptCb).toHaveBeenCalledWith('hello', true);
  });

  it('emits error when api key is missing', () => {
    delete process.env.GROK_API_KEY;
    const engine = new GrokSttEngine();
    const errorCb = vi.fn();
    engine.onError(errorCb);

    engine.start({ languageCode: 'en-US' });
    expect(errorCb).toHaveBeenCalledWith(expect.objectContaining({ message: 'GROK_API_KEY is not configured' }));
  });

  it('end closes websocket', () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokSttEngine();
    const mockWs = {
      on: vi.fn().mockReturnThis(),
      send: vi.fn(),
      close: vi.fn(),
    };
    (WebSocket as any).mockImplementation(function() { return mockWs; });

    engine.start({ languageCode: 'en-US' });
    engine.end();

    expect(mockWs.close).toHaveBeenCalled();
  });

  it('destroy closes websocket', () => {
    process.env.GROK_API_KEY = 'key';
    const engine = new GrokSttEngine();
    const mockWs = {
      on: vi.fn().mockReturnThis(),
      send: vi.fn(),
      close: vi.fn(),
    };
    (WebSocket as any).mockImplementation(function() { return mockWs; });

    engine.start({ languageCode: 'en-US' });
    engine.destroy();

    expect(mockWs.close).toHaveBeenCalled();
  });
});
