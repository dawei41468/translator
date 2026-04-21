import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleTranscript } from '../transcript-handler.js';

describe('handleTranscript', () => {
  const mockEngine = {
    translate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits recognized speech back to sender', async () => {
    const emitToSelf = vi.fn();
    const emitToRoom = vi.fn();
    const getParticipants = vi.fn().mockResolvedValue([
      { userId: 'user-1', user: { name: 'Me', language: 'en' } },
      { userId: 'user-2', user: { name: 'Other', language: 'es' } },
    ]);
    mockEngine.translate.mockResolvedValue('Hola');

    await handleTranscript({
      transcript: 'Hello',
      sourceLang: 'en',
      roomId: 'room-1',
      userId: 'user-1',
      soloMode: false,
      translationEngine: mockEngine as any,
      getParticipants,
      emitToRoom,
      emitToSelf,
    });

    expect(emitToSelf).toHaveBeenCalledWith('recognized-speech', expect.objectContaining({
      text: 'Hello',
      sourceLang: 'en',
    }));
  });

  it('returns early when no other participants and not solo', async () => {
    const emitToSelf = vi.fn();
    const getParticipants = vi.fn().mockResolvedValue([]);

    await handleTranscript({
      transcript: 'Hello',
      sourceLang: 'en',
      roomId: 'room-1',
      userId: 'user-1',
      soloMode: false,
      translationEngine: mockEngine as any,
      getParticipants,
      emitToRoom: vi.fn(),
      emitToSelf,
    });

    expect(mockEngine.translate).not.toHaveBeenCalled();
  });

  it('translates for participants with different languages', async () => {
    const emitToRoom = vi.fn();
    const emitToSelf = vi.fn();
    const getParticipants = vi.fn().mockResolvedValue([
      { userId: 'user-2', user: { name: 'User 2', language: 'es' } },
    ]);
    mockEngine.translate.mockResolvedValue('Hola');

    await handleTranscript({
      transcript: 'Hello',
      sourceLang: 'en',
      roomId: 'room-1',
      userId: 'user-1',
      soloMode: false,
      translationEngine: mockEngine as any,
      getParticipants,
      emitToRoom,
      emitToSelf,
    });

    expect(mockEngine.translate).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Hello',
      sourceLang: 'en',
      targetLang: 'es',
    }));
    expect(emitToRoom).toHaveBeenCalledWith('user-2', 'translated-message', expect.objectContaining({
      translatedText: 'Hola',
      targetLang: 'es',
    }));
  });

  it('sends original text to same-language participants', async () => {
    const emitToRoom = vi.fn();
    const emitToSelf = vi.fn();
    const getParticipants = vi.fn().mockResolvedValue([
      { userId: 'user-2', user: { name: 'User 2', language: 'en' } },
    ]);

    await handleTranscript({
      transcript: 'Hello',
      sourceLang: 'en',
      roomId: 'room-1',
      userId: 'user-1',
      soloMode: false,
      translationEngine: mockEngine as any,
      getParticipants,
      emitToRoom,
      emitToSelf,
    });

    expect(mockEngine.translate).not.toHaveBeenCalled();
    expect(emitToRoom).toHaveBeenCalledWith('user-2', 'translated-message', expect.objectContaining({
      translatedText: 'Hello',
      targetLang: 'en',
    }));
  });

  it('handles solo mode translation', async () => {
    const emitToSelf = vi.fn();
    const getParticipants = vi.fn().mockResolvedValue([]);
    mockEngine.translate.mockResolvedValue('Bonjour');

    await handleTranscript({
      transcript: 'Hello',
      sourceLang: 'en',
      roomId: 'room-1',
      userId: 'user-1',
      soloMode: true,
      soloTargetLang: 'fr',
      translationEngine: mockEngine as any,
      getParticipants,
      emitToRoom: vi.fn(),
      emitToSelf,
    });

    expect(mockEngine.translate).toHaveBeenCalledWith(expect.objectContaining({
      targetLang: 'fr',
    }));
    expect(emitToSelf).toHaveBeenCalledWith('solo-translated', expect.objectContaining({
      translatedText: 'Bonjour',
      targetLang: 'fr',
    }));
  });

  it('continues when one translation fails', async () => {
    const emitToRoom = vi.fn();
    const emitToSelf = vi.fn();
    const logWarn = vi.fn();
    const getParticipants = vi.fn().mockResolvedValue([
      { userId: 'user-2', user: { name: 'User 2', language: 'es' } },
      { userId: 'user-3', user: { name: 'User 3', language: 'de' } },
    ]);
    mockEngine.translate.mockImplementation((params: any) => {
      if (params.targetLang === 'es') return Promise.resolve('Hola');
      return Promise.reject(new Error('fail'));
    });

    await handleTranscript({
      transcript: 'Hello',
      sourceLang: 'en',
      roomId: 'room-1',
      userId: 'user-1',
      soloMode: false,
      translationEngine: mockEngine as any,
      getParticipants,
      emitToRoom,
      emitToSelf,
      logWarn,
    });

    expect(emitToRoom).toHaveBeenCalledWith('user-2', 'translated-message', expect.objectContaining({
      translatedText: 'Hola',
    }));
    expect(logWarn).toHaveBeenCalled();
  });

  it('groups participants by language', async () => {
    const emitToRoom = vi.fn();
    const emitToSelf = vi.fn();
    const getParticipants = vi.fn().mockResolvedValue([
      { userId: 'user-2', user: { name: 'User 2', language: 'es' } },
      { userId: 'user-3', user: { name: 'User 3', language: 'es' } },
      { userId: 'user-4', user: { name: 'User 4', language: 'de' } },
    ]);
    mockEngine.translate.mockImplementation((params: any) => {
      if (params.targetLang === 'es') return Promise.resolve('Hola');
      return Promise.resolve('Hallo');
    });

    await handleTranscript({
      transcript: 'Hello',
      sourceLang: 'en',
      roomId: 'room-1',
      userId: 'user-1',
      soloMode: false,
      translationEngine: mockEngine as any,
      getParticipants,
      emitToRoom,
      emitToSelf,
    });

    expect(mockEngine.translate).toHaveBeenCalledTimes(2);
    expect(emitToRoom).toHaveBeenCalledWith('user-2', 'translated-message', expect.anything());
    expect(emitToRoom).toHaveBeenCalledWith('user-3', 'translated-message', expect.anything());
    expect(emitToRoom).toHaveBeenCalledWith('user-4', 'translated-message', expect.anything());
  });
});
