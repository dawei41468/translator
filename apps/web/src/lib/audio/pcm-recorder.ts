/**
 * PCM Audio Recorder for iOS Fallback
 * Captures raw audio, downsamples to 16kHz (optional), and converts to 16-bit PCM (LINEAR16).
 * This allows iOS Safari to stream audio to Google Cloud STT which doesn't natively support
 * Safari's MediaRecorder formats (like audio/mp4) in its streaming API.
 */

export class PcmRecorder {
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private input: MediaStreamAudioSourceNode | null = null;
  private onDataAvailable: ((data: ArrayBuffer) => void) | null = null;
  private isRecording: boolean = false;

  constructor() {}

  async start(stream: MediaStream, onData: (data: ArrayBuffer) => void) {
    this.onDataAvailable = onData;
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Resume context if needed
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    const sampleRate = this.context.sampleRate;
    this.input = this.context.createMediaStreamSource(stream);
    
    // Use ScriptProcessorNode (deprecated but widely supported/reliable for raw access)
    // bufferSize: 4096 is a good balance between latency (approx 90ms at 44.1k) and performance
    this.processor = this.context.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Convert Float32 to Int16 PCM
      const pcm16 = this.floatTo16BitPCM(inputData);
      
      if (this.onDataAvailable) {
        this.onDataAvailable(pcm16.buffer as ArrayBuffer);
      }
    };

    this.input.connect(this.processor);
    this.processor.connect(this.context.destination); // Needed for processing to happen
    this.isRecording = true;

    return sampleRate;
  }

  stop() {
    this.isRecording = false;
    
    if (this.input) {
      this.input.disconnect();
      this.input = null;
    }
    
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }

  // Helper: Convert Float32 [-1, 1] to Int16 [-32768, 32767]
  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }
}
