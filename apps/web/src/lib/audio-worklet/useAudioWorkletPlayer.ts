import { useRef, useCallback, useEffect, useMemo } from "react";
import processorSource from "./practice-audio-processor.js?raw";

export interface AudioWorkletPlayer {
  /** Feed a base64-encoded PCM16 delta to the worklet. */
  playChunk: (base64Audio: string) => void;
  /** Resume the audio context if suspended. */
  resume: () => Promise<void>;
  /** Clear queued audio and stop playback. */
  clear: () => void;
  /** Dispose the worklet node and close the audio context. */
  dispose: () => Promise<void>;
  /** Whether the worklet was successfully initialized. */
  isReady: boolean;
  /** Register a callback for when the playback queue drains. */
  onPlaybackEmpty: (callback: (() => void) | null) => void;
}

/**
 * Creates an AudioWorklet-based PCM player.
 *
 * Because AudioWorkletProcessor modules must be loaded from a URL, this hook
 * inlines the processor source as a Blob URL so it works with Vite without
 * needing a separate public asset.
 */
export function useAudioWorkletPlayer(
  sampleRate: number
): AudioWorkletPlayer {
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const isReadyRef = useRef(false);
  const onPlaybackEmptyRef = useRef<(() => void) | null>(null);

  const ensureContext = useCallback(async () => {
    if (audioContextRef.current) return audioContextRef.current;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio API not supported");

    const ctx = new AudioContextClass({ sampleRate });
    audioContextRef.current = ctx;

    if (ctx.audioWorklet) {
      const blob = new Blob([processorSource], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;

      try {
        await ctx.audioWorklet.addModule(blobUrl);
        const node = new AudioWorkletNode(ctx, "practice-audio-processor", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        node.port.onmessage = (event) => {
          if (event.data?.type === "playback-empty") {
            onPlaybackEmptyRef.current?.();
          }
        };
        node.connect(ctx.destination);
        workletNodeRef.current = node;
        isReadyRef.current = true;
      } catch (error) {
        // Worklet setup failed; fall back to legacy path elsewhere.
        isReadyRef.current = false;
      }
    }

    return ctx;
  }, [sampleRate]);

  const playChunk = useCallback(async (base64Audio: string) => {
    const ctx = await ensureContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const node = workletNodeRef.current;
    if (node && isReadyRef.current) {
      node.port.postMessage({ type: "audio", base64: base64Audio });
    }
  }, [ensureContext]);

  const resume = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === "suspended") {
      await ctx.resume();
    }
  }, []);

  const clear = useCallback(() => {
    const node = workletNodeRef.current;
    if (node && isReadyRef.current) {
      node.port.postMessage({ type: "clear" });
    }
  }, []);

  const onPlaybackEmpty = useCallback((callback: (() => void) | null) => {
    onPlaybackEmptyRef.current = callback;
  }, []);

  const dispose = useCallback(async () => {
    clear();
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    isReadyRef.current = false;
  }, [clear]);

  useEffect(() => {
    return () => {
      void dispose();
    };
  }, [dispose]);

  return useMemo(() => ({
    playChunk,
    resume,
    clear,
    dispose,
    onPlaybackEmpty,
    get isReady() {
      return isReadyRef.current;
    },
  }), [playChunk, resume, clear, dispose, onPlaybackEmpty]);
}
