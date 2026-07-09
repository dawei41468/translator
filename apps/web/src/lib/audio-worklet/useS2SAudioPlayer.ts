import { useRef, useCallback, useEffect, useMemo } from "react";
import processorSource from "./practice-audio-processor.js?raw";

export interface S2SAudioPlayer {
  /** Feed a base64-encoded PCM16 delta to the worklet. */
  playChunk: (base64Audio: string) => void;
  /** Resume the audio context if suspended. */
  resume: () => Promise<void>;
  /** Eagerly create the AudioContext and worklet node. Returns true if ready. */
  initialize: () => Promise<boolean>;
  /** Clear queued audio and stop playback. */
  clear: () => void;
  /** Dispose the worklet node and close the audio context. */
  dispose: () => Promise<void>;
  /** Whether the worklet was successfully initialized. */
  isReady: boolean;
  /** Register a callback for when the playback queue drains. */
  onPlaybackEmpty: (callback: (() => void) | null) => void;
  /** Register a callback when worklet setup fails (or play is impossible). */
  onError: (callback: ((message: string) => void) | null) => void;
}

/**
 * Creates an AudioWorklet-based PCM player.
 *
 * Because AudioWorkletProcessor modules must be loaded from a URL, this hook
 * inlines the processor source as a Blob URL so it works with Vite without
 * needing a separate public asset.
 */
export function useS2SAudioPlayer(
  sampleRate: number
): S2SAudioPlayer {
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const isReadyRef = useRef(false);
  const initFailedRef = useRef(false);
  const onPlaybackEmptyRef = useRef<(() => void) | null>(null);
  const onErrorRef = useRef<((message: string) => void) | null>(null);
  const errorNotifiedRef = useRef(false);

  const notifyError = useCallback((message: string) => {
    if (errorNotifiedRef.current) return;
    errorNotifiedRef.current = true;
    onErrorRef.current?.(message);
  }, []);

  const ensureContext = useCallback(async () => {
    if (audioContextRef.current) return audioContextRef.current;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      initFailedRef.current = true;
      notifyError("Web Audio API is not supported in this browser.");
      throw new Error("Web Audio API not supported");
    }

    const ctx = new AudioContextClass({ sampleRate });
    audioContextRef.current = ctx;

    if (!ctx.audioWorklet) {
      initFailedRef.current = true;
      notifyError("Audio playback is not available in this browser.");
      return ctx;
    }

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
      isReadyRef.current = false;
      initFailedRef.current = true;
      notifyError("Could not start audio playback. Try refreshing the page.");
      if (import.meta.env.DEV) {
        console.warn("[useS2SAudioPlayer] AudioWorklet setup failed", error);
      }
    }

    return ctx;
  }, [sampleRate, notifyError]);

  const playChunk = useCallback(async (base64Audio: string) => {
    try {
      const ctx = await ensureContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const node = workletNodeRef.current;
      if (node && isReadyRef.current) {
        node.port.postMessage({ type: "audio", base64: base64Audio });
      } else if (initFailedRef.current) {
        notifyError("Could not start audio playback. Try refreshing the page.");
      }
    } catch {
      notifyError("Could not start audio playback. Try refreshing the page.");
    }
  }, [ensureContext, notifyError]);

  const initialize = useCallback(async () => {
    try {
      await ensureContext();
      return isReadyRef.current;
    } catch {
      return false;
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

  const onError = useCallback((callback: ((message: string) => void) | null) => {
    onErrorRef.current = callback;
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
    initialize,
    clear,
    dispose,
    onPlaybackEmpty,
    onError,
    get isReady() {
      return isReadyRef.current;
    },
  }), [playChunk, resume, initialize, clear, dispose, onPlaybackEmpty, onError]);
}
