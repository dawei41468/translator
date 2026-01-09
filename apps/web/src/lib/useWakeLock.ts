import { useEffect, useRef, useState, useCallback } from 'react';

export const useWakeLock = (enabled: boolean = true) => {
  const [isLocked, setIsLocked] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestLock = useCallback(async () => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    // If we already have a lock (and it's not released), don't request another
    if (wakeLockRef.current && !wakeLockRef.current.released) return;

    try {
      const lock = await navigator.wakeLock.request('screen');
      wakeLockRef.current = lock;
      setIsLocked(true);
      
      lock.addEventListener('release', () => {
        // Only update state if this was the current lock
        if (wakeLockRef.current === lock) {
          wakeLockRef.current = null;
          setIsLocked(false);
        }
      });
    } catch (err) {
      // Allowed to fail (e.g. low battery, system policy)
      console.warn('Failed to request wake lock:', err);
    }
  }, [enabled]);

  const releaseLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setIsLocked(false);
      } catch (err) {
        console.warn('Failed to release wake lock:', err);
      }
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      requestLock();
    } else {
      releaseLock();
    }

    return () => {
      releaseLock();
    };
  }, [enabled, requestLock, releaseLock]);

  // Re-request lock when page becomes visible
  // The browser releases the lock automatically when visibility is lost
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, requestLock]);

  return { isLocked };
};
