import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleSttEngine } from '../google-stt-engine.js';
import { createRecognizeStream } from '../../stt.js';

vi.mock('../../stt.js', () => ({
  createRecognizeStream: vi.fn((_config: any, onData: any, onError: any) => {
    const stream = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn().mockReturnThis(),
      _triggerData: onData,
      _triggerError: onError,
    };
    return stream;
  }),
}));

describe('GoogleSttEngine', () => {
  let engine: GoogleSttEngine;

  beforeEach(() => {
    engine = new GoogleSttEngine();
    vi.clearAllMocks();
  });

  it('is always available', () => {
    expect(engine.isAvailable()).toBe(true);
  });

  it('getName returns Google Cloud STT', () => {
    expect(engine.getName()).toBe('Google Cloud STT');
  });

  it('start creates a recognize stream', () => {
    engine.start({ languageCode: 'en-US' });
    expect(createRecognizeStream).toHaveBeenCalledWith(
      { languageCode: 'en-US' },
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('write sends chunk to stream', () => {
    engine.start({ languageCode: 'en-US' });
    const stream = (createRecognizeStream as any).mock.results[0].value;
    const chunk = Buffer.from('audio');
    engine.write(chunk);
    expect(stream.write).toHaveBeenCalledWith(chunk);
  });

  it('end closes the stream', () => {
    engine.start({ languageCode: 'en-US' });
    const stream = (createRecognizeStream as any).mock.results[0].value;
    engine.end();
    expect(stream.end).toHaveBeenCalled();
  });

  it('destroy ends the stream', () => {
    engine.start({ languageCode: 'en-US' });
    const stream = (createRecognizeStream as any).mock.results[0].value;
    engine.destroy();
    expect(stream.end).toHaveBeenCalled();
  });

  it('emits transcript callback on final', () => {
    const transcriptCb = vi.fn();
    engine.onTranscript(transcriptCb);
    engine.start({ languageCode: 'en-US' });

    const stream = (createRecognizeStream as any).mock.results[0].value;
    stream._triggerData('hello', true);

    expect(transcriptCb).toHaveBeenCalledWith('hello', true);
  });

  it('emits error callback', () => {
    const errorCb = vi.fn();
    engine.onError(errorCb);
    engine.start({ languageCode: 'en-US' });

    const stream = (createRecognizeStream as any).mock.results[0].value;
    stream._triggerError(new Error('stream error'));

    expect(errorCb).toHaveBeenCalledWith(expect.objectContaining({ message: 'stream error' }));
  });

  it('emits end callback when stream ends', () => {
    const endCb = vi.fn();
    engine.onEnd(endCb);
    engine.start({ languageCode: 'en-US' });

    const stream = (createRecognizeStream as any).mock.results[0].value;
    const endHandler = stream.on.mock.calls.find((c: any[]) => c[0] === 'end')?.[1];
    endHandler?.();

    expect(endCb).toHaveBeenCalled();
  });
});
