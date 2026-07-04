import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Mic, MicOff, Volume2 } from "lucide-react";
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

const Practice = () => {
  const { t } = useTranslation();

  const [homeLang, setHomeLang] = useState("en");
  const [targetLang, setTargetLang] = useState("zh");
  const [isPracticing, setIsPracticing] = useState(false);
  const [status, setStatus] = useState<"idle" | "listening" | "processing" | "speaking">("idle");
  const [lastUtterance, setLastUtterance] = useState<string>("");
  const [translatedText, setTranslatedText] = useState<string>("");

  const homeLanguage = LANGUAGES.find(l => l.code === homeLang);
  const targetLanguage = LANGUAGES.find(l => l.code === targetLang);

  // Refs for realtime voice
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const isPracticingRef = useRef(false);
  const SAMPLE_RATE = 24000;

  const getLangName = (code: string) => {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang?.nativeName || code;
  };

  const playAudioChunk = useCallback(async (base64Audio: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768.0;
    }

    audioQueueRef.current.push(float32);
    console.log('[Practice] Received audio delta, queue length:', audioQueueRef.current.length);
    if (!isPlayingRef.current) {
      playNextChunk();
    }
  }, []);

  const playNextChunk = () => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      if (isPracticing) setStatus("listening");
      return;
    }

    isPlayingRef.current = true;
    setStatus("speaking");

    const ctx = audioContextRef.current;
    const float32 = audioQueueRef.current.shift()!;
    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    console.log('[Practice] Playing audio chunk');

    source.onended = () => {
      playNextChunk();
    };

    source.start();
  };

  const connectVoice = async () => {
    try {
      // 1. Get ephemeral token from server
      const tokenData = await apiClient.getVoiceEphemeralToken();
      const ephemeralToken = tokenData.value;

      // 2. Connect WS using protocol for browser (no custom headers)
      const wsUrl = `wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-1.0`;
      const ws = new WebSocket(wsUrl, [`xai-client-secret.${ephemeralToken}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Practice] WS connected, sending session.update');
        // Configure session for translation practice
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

        // Start capturing mic
        startAudioCapture(ws);
      };

      ws.onerror = (err) => {
        console.error('[Practice] WS error', err);
        stopPractice();
      };

      ws.onclose = (ev) => {
        console.log('[Practice] WS closed', ev.code, ev.reason);
        // Only stop if we are still in practicing state (avoid double stop)
        if (isPracticingRef.current) {
          stopPractice();
        }
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('[Practice] WS event:', data.type);

        if (data.type === "response.output_audio.delta" && data.delta) {
          playAudioChunk(data.delta);
        }

        // Input transcription (what the user said in home language)
        if (data.type === 'conversation.item.input_audio_transcription.completed' && data.transcript) {
          setLastUtterance(data.transcript);
        }

        // Output translation transcript (what the model spoke in target language)
        if (data.type === 'response.output_audio_transcript.delta' && data.transcript) {
          // Append delta for streaming effect, or replace if full
          setTranslatedText(prev => prev + data.transcript);
        }
        if (data.type === 'response.output_audio_transcript.done' && data.transcript) {
          setTranslatedText(data.transcript); // ensure final
        }

        if (data.type === "input_audio_buffer.speech_started") {
          // New utterance starting - clear previous translation
          setTranslatedText("");
        }

        if (data.type === "response.done") {
          if (isPracticing) setStatus("listening");
        }

        if (data.type === "error") {
          console.error('[Practice] Voice error:', data);
          stopPractice();
        }

        if (data.type === "session.created") {
          console.log('[Practice] Session created');
        }
      };

      ws.onerror = (err) => {
        console.error("Voice WS error", err);
        stopPractice();
      };

      ws.onclose = () => {
        stopPractice();
      };

    } catch (err) {
      console.error("Failed to start voice practice", err);
      stopPractice();
    }
  };

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
      console.log('[Practice] Mic stream acquired');
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

      // Use ScriptProcessor for raw PCM chunks (reliable for streaming)
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || !isPracticingRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Base64 encode and send
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        if (!window.__practiceAudioSent) {
          console.log('[Practice] First audio chunk sent to WS');
          window.__practiceAudioSent = true;
        }
        // Throttle log to avoid spam
        if (Math.random() < 0.02) console.log('[Practice] streaming audio...');

        ws.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64,
        }));
      };

      source.connect(processor);

      // Connect through a zero-gain node so the audio graph stays active (required for ScriptProcessor to fire)
      // without audible echo from the mic.
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);

      setStatus("listening");
      console.log('[Practice] Audio capture started, streaming to WS');

    } catch (err) {
      console.error("Mic capture failed", err);
      stopPractice();
    }
  };

  const stopVoiceConnection = () => {
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  const stopPractice = useCallback(() => {
    isPracticingRef.current = false;
    setIsPracticing(false);
    setStatus("idle");
    setLastUtterance("");
    setTranslatedText("");
    stopVoiceConnection();
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
  }, []);

  const togglePractice = async () => {
    if (isPracticing) {
      stopPractice();
    } else {
      isPracticingRef.current = true;
      isPracticingRef.current = true;
      window.__practiceAudioSent = false;
      setIsPracticing(true);
      setStatus("listening");
      setLastUtterance("");
      setTranslatedText("");
      await connectVoice();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoiceConnection();
    };
  }, []);

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
            <Button
              size="lg"
              className="h-20 w-20 rounded-full text-lg"
              variant={isPracticing ? "destructive" : "default"}
              onClick={togglePractice}
            >
              {isPracticing ? (
                <MicOff className="h-8 w-8" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </Button>

            <div className="text-center">
              <div className="text-sm text-muted-foreground">
                {isPracticing ? "Tap to stop" : "Tap to start practicing"}
              </div>
              <div className="mt-1 text-lg font-medium capitalize">
                {status === "idle" && "Ready"}
                {status === "listening" && "Listening..."}
                {status === "processing" && "Translating..."}
                {status === "speaking" && "Speaking back..."}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
