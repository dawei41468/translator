import { useRef, useCallback, useEffect } from "react";

/**
 * Generates a rhythmic pulse animation suitable for UI feedback when no real
 * audio stream is available (e.g. conversation mic button glow).
 */
export function useRecordingPulse(isRecording: boolean) {
  const rafRef = useRef<number | null>(null);
  const valuesRef = useRef<number[]>(Array.from({ length: 24 }, () => 0));
  const timeRef = useRef(0);

  const tick = useCallback(() => {
    timeRef.current += 0.08;
    valuesRef.current = valuesRef.current.map((_, i) => {
      const offset = i * 0.25;
      const wave = Math.sin(timeRef.current + offset) * 0.5 + 0.5;
      return 0.15 + wave * 0.55;
    });
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (!isRecording) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      valuesRef.current = valuesRef.current.map(() => 0);
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isRecording, tick]);

  return { getValues: () => valuesRef.current };
}
