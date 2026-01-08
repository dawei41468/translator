import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationControls } from './ConversationControls';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ConversationControls (push-to-talk)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderHarness(opts?: { pushToTalkEnabled?: boolean }) {
    const startRecording = vi.fn();
    const stopRecording = vi.fn();

    const props = {
      isRecording: false,
      toggleRecording: vi.fn(),
      startRecording,
      stopRecording,
      pushToTalkEnabled: opts?.pushToTalkEnabled ?? true,
      connectionStatus: 'connected',
      soloMode: false,
      toggleSoloMode: vi.fn(),
      soloTargetLang: 'en',
      onSoloLangChange: vi.fn(),
      userLanguage: 'en',
    } as const;

    const { rerender } = render(<ConversationControls {...props} />);

    return {
      rerender: (next: Partial<typeof props>) => rerender(<ConversationControls {...props} {...next} />),
      startRecording,
      stopRecording,
    };
  }

  it('starts on pointer down and stops on pointer up', () => {
    const h = renderHarness();

    const btn = screen.getByTestId('toggle-recording');

    fireEvent.pointerDown(btn, { pointerId: 1, clientY: 200 });
    expect(h.startRecording).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(btn, { pointerId: 1, clientY: 200 });
    expect(h.stopRecording).toHaveBeenCalledTimes(1);
  });

  it('locks on slide up and does not stop on pointer up; stop button stops', () => {
    const h = renderHarness();

    const btn = screen.getByTestId('toggle-recording');

    fireEvent.pointerDown(btn, { pointerId: 1, clientY: 200 });
    expect(h.startRecording).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(btn, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(btn, { pointerId: 1, clientY: 100 });
    expect(h.stopRecording).toHaveBeenCalledTimes(0);

    fireEvent.click(btn);
    expect(h.stopRecording).toHaveBeenCalledTimes(1);
  });

  it('auto-stops at 60s', () => {
    const h = renderHarness();

    const btn = screen.getByTestId('toggle-recording');

    fireEvent.pointerDown(btn, { pointerId: 1, clientY: 200 });
    expect(h.startRecording).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(h.stopRecording).toHaveBeenCalledTimes(1);
  });
});
