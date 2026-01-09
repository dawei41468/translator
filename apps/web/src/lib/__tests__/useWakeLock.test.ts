import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWakeLock } from '../useWakeLock';

describe('useWakeLock', () => {
  let requestMock: any;
  let releaseMock: any;
  let eventListeners: Record<string, Function> = {};

  beforeEach(() => {
    eventListeners = {};
    releaseMock = vi.fn().mockResolvedValue(undefined);
    
    requestMock = vi.fn().mockResolvedValue({
      release: releaseMock,
      released: false,
      addEventListener: (event: string, handler: Function) => {
        eventListeners[event] = handler;
      },
      removeEventListener: vi.fn(),
    });

    Object.defineProperty(navigator, 'wakeLock', {
      writable: true,
      value: {
        request: requestMock,
      },
    });

    // Mock document visibility
    Object.defineProperty(document, 'visibilityState', {
      writable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requests wake lock when enabled', async () => {
    renderHook(() => useWakeLock(true));
    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledWith('screen');
    });
  });

  it('does not request wake lock when disabled', () => {
    renderHook(() => useWakeLock(false));
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('releases wake lock when disabled', async () => {
    const { rerender } = renderHook(({ enabled }) => useWakeLock(enabled), {
      initialProps: { enabled: true },
    });

    // Wait for the lock to be acquired
    await waitFor(() => {
      expect(requestMock).toHaveBeenCalled();
    });
    
    rerender({ enabled: false });
    await waitFor(() => {
      expect(releaseMock).toHaveBeenCalled();
    });
  });

  it('releases wake lock on unmount', async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    
    // Wait for the lock to be acquired
    await waitFor(() => {
      expect(requestMock).toHaveBeenCalled();
    });
    
    unmount();
    await waitFor(() => {
      expect(releaseMock).toHaveBeenCalled();
    });
  });

  it('re-requests lock when visibility changes to visible', async () => {
    renderHook(() => useWakeLock(true));
    
    // 1. Initial request
    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    // Get the lock object returned by the mock
    const lock = await requestMock.mock.results[0].value;
    
    // 2. Simulate visibility change to hidden -> browser releases lock
    Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Simulate the lock being released by the browser
    lock.released = true;
    if (eventListeners['release']) {
      act(() => {
        eventListeners['release']();
      });
    }
    
    // 3. Simulate visibility change to visible -> should request again
    Object.defineProperty(document, 'visibilityState', { value: 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledTimes(2);
    });
  });
});
