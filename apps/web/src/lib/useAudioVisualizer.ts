import { useRef, useCallback, useEffect } from "react";

export interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
  className?: string;
  barCount?: number;
}

/**
 * Lightweight analyser-driven audio visualizer.
 * Creates and tears down the AudioContext/AnalyserNode when active state changes.
 */
export function useAudioVisualizer() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const valuesRef = useRef<number[]>([]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    valuesRef.current = [];
  }, []);

  const start = useCallback((stream: MediaStream, onFrame: (values: number[]) => void) => {
    stop();

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.7;
    analyserRef.current = analyser;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      const values = Array.from(dataArray).map(v => v / 255);
      valuesRef.current = values;
      onFrame(values);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { start, stop, getValues: () => valuesRef.current };
}
