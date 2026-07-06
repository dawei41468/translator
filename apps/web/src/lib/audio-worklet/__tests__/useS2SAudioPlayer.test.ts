import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useS2SAudioPlayer } from "../useS2SAudioPlayer";

describe("useS2SAudioPlayer", () => {
  const mockPostMessage = vi.fn();
  const mockDisconnect = vi.fn();
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockAddModule = vi.fn().mockResolvedValue(undefined);
  const mockResume = vi.fn().mockResolvedValue(undefined);

  let lastAudioWorkletNode: MockAudioWorkletNode | null = null;

  class MockAudioWorkletNode {
    port = { postMessage: mockPostMessage, onmessage: null as ((event: MessageEvent) => void) | null };
    connect = vi.fn();
    disconnect = mockDisconnect;
    constructor() {
      lastAudioWorkletNode = this;
    }
  }

  class MockAudioContext {
    state = "running";
    audioWorklet = { addModule: mockAddModule };
    resume = mockResume;
    close = mockClose;
    destination = {} as AudioDestinationNode;
  }

  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(global, "AudioContext", {
      writable: true,
      value: MockAudioContext,
      configurable: true,
    });

    Object.defineProperty(global, "AudioWorkletNode", {
      writable: true,
      value: MockAudioWorkletNode,
      configurable: true,
    });

    Object.defineProperty(global, "Blob", {
      writable: true,
      value: class MockBlob {
        size: number;
        constructor(parts: unknown[]) {
          this.size = parts.join("").length;
        }
      },
      configurable: true,
    });

    mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    mockRevokeObjectURL = vi.fn();

    Object.defineProperty(global, "URL", {
      writable: true,
      value: {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      },
      configurable: true,
    });

    Object.defineProperty(global, "window", {
      writable: true,
      value: global,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes the worklet node lazily on first playChunk", async () => {
    const { result } = renderHook(() => useS2SAudioPlayer(24000));

    expect(result.current.isReady).toBe(false);

    await act(async () => {
      await result.current.playChunk("AAAA");
    });

    expect(mockAddModule).toHaveBeenCalledWith("blob:mock-url");
    expect(result.current.isReady).toBe(true);
  });

  it("posts audio chunks to the worklet port", async () => {
    const { result } = renderHook(() => useS2SAudioPlayer(24000));

    await act(async () => {
      await result.current.playChunk("AAAA");
    });

    expect(mockPostMessage).toHaveBeenCalledWith({ type: "audio", base64: "AAAA" });
  });

  it("clears queued audio on clear()", async () => {
    const { result } = renderHook(() => useS2SAudioPlayer(24000));

    await act(async () => {
      await result.current.playChunk("AAAA");
      result.current.clear();
    });

    expect(mockPostMessage).toHaveBeenLastCalledWith({ type: "clear" });
  });

  it("notifies onPlaybackEmpty when worklet posts playback-empty", async () => {
    const onEmpty = vi.fn();
    const { result } = renderHook(() => useS2SAudioPlayer(24000));

    act(() => {
      result.current.onPlaybackEmpty(onEmpty);
    });

    await act(async () => {
      await result.current.playChunk("AAAA");
    });

    // Simulate the worklet sending playback-empty
    expect(lastAudioWorkletNode).toBeDefined();
    act(() => {
      lastAudioWorkletNode!.port.onmessage?.({ data: { type: "playback-empty" } } as MessageEvent);
    });

    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it("falls back to not-ready when AudioWorklet is unavailable", async () => {
    class MockAudioContextNoWorklet {
      state = "running";
      audioWorklet = null;
      resume = mockResume;
      close = mockClose;
      destination = {} as AudioDestinationNode;
    }

    Object.defineProperty(global, "AudioContext", {
      writable: true,
      value: MockAudioContextNoWorklet,
      configurable: true,
    });

    const { result } = renderHook(() => useS2SAudioPlayer(24000));

    await act(async () => {
      await result.current.playChunk("AAAA");
    });

    expect(result.current.isReady).toBe(false);
  });

  it("disposes context and revokes blob URL on unmount", async () => {
    const { result, unmount } = renderHook(() => useS2SAudioPlayer(24000));

    await act(async () => {
      await result.current.playChunk("AAAA");
    });

    unmount();

    await waitFor(() => {
      expect(mockClose).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });
  });
});
