import { render, screen, fireEvent, act } from '@testing-library/react';
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
    Object.defineProperty(navigator, 'vibrate', {
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
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
      canStartRecording: true,
      connectionStatus: 'connected',
      openSettings: vi.fn(),
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
    expect(navigator.vibrate).toHaveBeenCalledWith(10); // Light haptic on start

    fireEvent.pointerUp(btn, { pointerId: 1, clientY: 200 });
    expect(h.stopRecording).toHaveBeenCalledTimes(1);
  });

  it('locks on slide up and triggers haptic', () => {
    const h = renderHarness();

    const btn = screen.getByTestId('toggle-recording');

    fireEvent.pointerDown(btn, { pointerId: 1, clientY: 200 });
    
    // Slide up
    fireEvent.pointerMove(btn, { pointerId: 1, clientY: 100 });
    expect(navigator.vibrate).toHaveBeenCalledWith(50); // Medium haptic on lock
    
    fireEvent.pointerUp(btn, { pointerId: 1, clientY: 100 });
    expect(h.stopRecording).toHaveBeenCalledTimes(0);

    // Stop manually
    fireEvent.click(btn);
    expect(h.stopRecording).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(50); // Medium haptic on stop
  });

  it('auto-stops at 60s', () => {
    const h = renderHarness();

    const btn = screen.getByTestId('toggle-recording');

    fireEvent.pointerDown(btn, { pointerId: 1, clientY: 200 });
    expect(h.startRecording).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(h.stopRecording).toHaveBeenCalledTimes(1);
  });
});
