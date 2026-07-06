import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Volume2, AlertCircle, RotateCcw } from "lucide-react";
import { LANGUAGES, formatLanguageLabel } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import { AudioWaveform } from "@/components/AudioWaveform";
import { useAudioVisualizer } from "@/lib/useAudioVisualizer";
import { useS2SAudioPlayer } from "@/lib/audio-worklet/useS2SAudioPlayer";
import captureProcessorSource from "@/lib/audio-worklet/practice-capture-processor.js?raw";
import { cn } from "@/lib/utils";

type PracticeStatus = "idle" | "connecting" | "listening" | "processing" | "speaking";

type PracticeError = {
  title: string;
  message: string;
  canRetry: boolean;
};

const Practice = () => {
  const [homeLang, setHomeLang] = useState("en");
  const [targetLang, setTargetLang] = useState("zh");
  const [isPracticing, setIsPracticing] = useState(false);
  const [status, setStatus] = useState<PracticeStatus>("idle");
  const [lastUtterance, setLastUtterance] = useState<string>("");
  const [translatedText, setTranslatedText] = useState<string>("");
  const [error, setError] = useState<PracticeError | null>(null);
  const [visualizerValues, setVisualizerValues] = useState<number[]>([]);

  const homeLanguage = LANGUAGES.find(l => l.code === homeLang);
  const targetLanguage = LANGUAGES.find(l => l.code === targetLang);

  // Refs for realtime voice
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const captureBlobUrlRef = useRef<string | null>(null);
  const isPracticingRef = useRef(false);
  const SAMPLE_RATE = 24000;

  const { start: startVisualizer, stop: stopVisualizer } = useAudioVisualizer();
  const audioWorkletPlayer = useS2SAudioPlayer(SAMPLE_RATE);

  useEffect(() => {
    audioWorkletPlayer.onPlaybackEmpty(() => {
      if (isPracticingRef.current) setStatus("listening");
    });
    return () => {
      audioWorkletPlayer.onPlaybackEmpty(null);
    };
  }, [audioWorkletPlayer]);

  const getLangName = (code: string) => {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang?.nativeName || code;
  };

  const setFatalError = useCallback((title: string, message: string) => {
    setError({ title, message, canRetry: true });
    void stopPracticeInternal();
  }, []);

  const playAudioChunk = useCallback(async (base64Audio: string) => {
    await audioWorkletPlayer.resume();
    audioWorkletPlayer.playChunk(base64Audio);
    setStatus("speaking");
  }, [audioWorkletPlayer]);

  const stopPracticeInternal = useCallback(() => {
    isPracticingRef.current = false;
    setIsPracticing(false);
    setStatus("idle");
    stopVisualizer();
    setVisualizerValues([]);

    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    if (processorRef.current) {
      try { processorRef.current.port.postMessage({ type: 'stop' }); } catch {}
      try { processorRef.current.disconnect(); } catch {}
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      try { inputSourceRef.current.disconnect(); } catch {}
      inputSourceRef.current = null;
    }
    if (captureBlobUrlRef.current) {
      URL.revokeObjectURL(captureBlobUrlRef.current);
      captureBlobUrlRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    audioWorkletPlayer.clear();
    void audioWorkletPlayer.dispose();
  }, [stopVisualizer, audioWorkletPlayer]);

  const stopPractice = useCallback(() => {
    setLastUtterance("");
    setTranslatedText("");
    stopPracticeInternal();
  }, [stopPracticeInternal]);

  const connectVoice = useCallback(async () => {
    try {
      setError(null);
      setStatus("connecting");
      const tokenData = await apiClient.getVoiceEphemeralToken();
      const ephemeralToken = tokenData.value;

      const wsUrl = `wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-1.0`;
      const ws = new WebSocket(wsUrl, [`xai-client-secret.${ephemeralToken}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        const homeName = getLangName(homeLang);
        const targetName = getLangName(targetLang);

        const instructions =
          `You are a helpful language practice partner. ` +
          `The user is speaking in ${homeName}. ` +
          `Listen carefully to what they say. ` +
          `Translate it accurately into natural, conversational ${targetName}. ` +
          `Speak ONLY the translation back to the user with good pronunciation, tone and prosody. ` +
          `Do not add any extra commentary, explanations, or English text. ` +
          `Keep it concise and match the user's speaking style.`;

        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            voice: "eve",
            instructions,
            turn_detection: {
              type: "server_vad",
              silence_duration_ms: 400,
              threshold: 0.6,
              prefix_padding_ms: 200,
            },
            audio: {
              input: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
              output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
            },
            "audio.input.transcription.language_hint": homeLang,
          },
        }));

        startAudioCapture(ws);
      };

      ws.onerror = () => {
        setFatalError(
          "Voice connection failed",
          "Could not connect to the voice service. Please check your network and try again."
        );
      };

      ws.onclose = () => {
        if (isPracticingRef.current) {
          setFatalError(
            "Voice session ended",
            "The connection to the voice service closed unexpectedly."
          );
        }
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "response.output_audio.delta" && data.delta) {
          playAudioChunk(data.delta);
        }

        if (data.type === 'conversation.item.input_audio_transcription.completed' && data.transcript) {
          setLastUtterance(data.transcript);
        }

        if (data.type === 'response.output_audio_transcript.delta' && data.transcript) {
          setTranslatedText(prev => prev + data.transcript);
        }
        if (data.type === 'response.output_audio_transcript.done' && data.transcript) {
          setTranslatedText(data.transcript);
        }

        if (data.type === "input_audio_buffer.speech_started") {
          setTranslatedText("");
        }

        if (data.type === "response.done") {
          if (isPracticingRef.current) setStatus("listening");
        }

        if (data.type === "error") {
          const message = data.error?.message || data.message || "An error occurred in the voice session.";
          setFatalError("Voice error", message);
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start voice practice.";
      setFatalError("Could not start practice", message);
    }
  }, [homeLang, targetLang, playAudioChunk, setFatalError]);

  const startAudioCapture = async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: SAMPLE_RATE },
          channelCount: { ideal: 1 },
        },
      });
      mediaStreamRef.current = stream;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });
      audioContextRef.current = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      inputSourceRef.current = source;

      // Load the capture processor from an inlined Blob URL so it works in any
      // bundler environment without needing a separate public asset.
      const blob = new Blob([captureProcessorSource], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      captureBlobUrlRef.current = blobUrl;

      await ctx.audioWorklet.addModule(blobUrl);

      const worklet = new AudioWorkletNode(ctx, 'practice-capture-processor', {
        channelCount: 1,
        numberOfInputs: 1,
        numberOfOutputs: 0,
      });
      processorRef.current = worklet;

      worklet.port.onmessage = (event) => {
        const { type, base64 } = event.data;
        if (type !== 'audio' || !base64) return;
        if (!ws || ws.readyState !== WebSocket.OPEN || !isPracticingRef.current) return;

        ws.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64,
        }));
      };

      source.connect(worklet);
      worklet.port.postMessage({ type: 'start' });

      startVisualizer(stream, (values) => {
        setVisualizerValues(values);
      });

      setStatus("listening");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Microphone access was denied or unavailable.";
      setFatalError("Microphone error", message);
    }
  };

  const togglePractice = async () => {
    if (isPracticing) {
      stopPractice();
    } else {
      setError(null);
      isPracticingRef.current = true;
      setIsPracticing(true);
      setLastUtterance("");
      setTranslatedText("");
      await connectVoice();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPracticeInternal();
    };
  }, [stopPracticeInternal]);

  const statusLabel = {
    idle: "Ready",
    connecting: "Connecting...",
    listening: "Listening...",
    processing: "Translating...",
    speaking: "Speaking back...",
  }[status];

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Mic className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Practice</h1>
      </div>

      <p className="text-muted-foreground mb-8">
        Speak in your language. Hear the natural translation spoken back in the target language.
        Perfect for testing and deliberate language practice.
      </p>

      {/* Language Pair Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Language Pair</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="home-lang">I speak (Home language)</Label>
            <Select value={homeLang} onValueChange={setHomeLang} disabled={isPracticing}>
              <SelectTrigger id="home-lang" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {formatLanguageLabel(lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="target-lang">I want to hear (Target language)</Label>
            <Select value={targetLang} onValueChange={setTargetLang} disabled={isPracticing}>
              <SelectTrigger id="target-lang" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {formatLanguageLabel(lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Practice Controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              {isPracticing && (
                <>
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
                </>
              )}
              <Button
                size="lg"
                className={cn(
                  "relative z-10 h-20 w-20 rounded-full text-lg transition-all duration-300",
                  isPracticing ? "scale-110" : "hover:scale-105"
                )}
                variant={isPracticing ? "destructive" : "default"}
                onClick={togglePractice}
                disabled={status === "connecting"}
              >
                {isPracticing ? (
                  <MicOff className="h-8 w-8" />
                ) : (
                  <Mic className="h-8 w-8" />
                )}
              </Button>
            </div>

            {isPracticing && (
              <AudioWaveform values={visualizerValues} className="text-primary" />
            )}

            <div className="text-center">
              <div className="text-sm text-muted-foreground">
                {isPracticing ? "Tap to stop" : "Tap to start practicing"}
              </div>
              <div className="mt-1 text-lg font-medium capitalize">
                {statusLabel}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold">{error.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
              </div>
              {error.canRetry && (
                <Button variant="outline" onClick={togglePractice}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Try again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feedback Area */}
      {(lastUtterance || translatedText) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" /> Last Exchange
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lastUtterance && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  You said ({homeLanguage?.nativeName})
                </div>
                <div className="rounded-md bg-muted p-3 text-sm">{lastUtterance}</div>
              </div>
            )}

            {translatedText && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Heard in {targetLanguage?.nativeName}
                </div>
                <div className="rounded-md bg-primary/10 p-3 text-sm font-medium">
                  {translatedText}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-8 text-center text-xs text-muted-foreground">
        Powered by Grok Voice speech-to-speech. Uses server VAD for natural turn-taking.
      </div>
    </div>
  );
};

export default Practice;
