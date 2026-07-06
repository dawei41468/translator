/**
 * AudioWorkletProcessor that plays queued PCM16 audio deltas.
 *
 * Messages from the main thread:
 *   { type: 'audio', base64: string }  -> decode and append to playback queue
 *   { type: 'clear' }                  -> drop all queued audio
 *
 * The processor maintains a queue of decoded Float32Arrays.
 */

/**
 * Decode a base64 string into a signed 16-bit PCM Int16Array.
 * @param {string} base64
 * @returns {Int16Array}
 */
function decodeBase64ToPCM16(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

/**
 * Convert signed 16-bit PCM samples to normalized 32-bit float samples.
 * @param {Int16Array} pcm16
 * @returns {Float32Array}
 */
function pcm16ToFloat32(pcm16) {
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768.0;
  }
  return float32;
}

class PracticeAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {Float32Array[]} */
    this.queue = [];
    /** @type {Float32Array | null} */
    this.current = null;
    /** @type {number} */
    this.currentOffset = 0;
    /** @type {boolean} */
    this.hadAudio = false;

    this.port.onmessage = (event) => {
      const { type } = event.data;
      if (type === 'audio') {
        const pcm16 = decodeBase64ToPCM16(event.data.base64);
        const float32 = pcm16ToFloat32(pcm16);
        this.queue.push(float32);
        this.hadAudio = true;
      } else if (type === 'clear') {
        this.queue = [];
        this.current = null;
        this.currentOffset = 0;
        this.hadAudio = false;
      }
    };
  }

  /**
   * @param {Float32Array[][]} _inputs
   * @param {Float32Array[][]} outputs
   * @param {Record<string, Float32Array>} _parameters
   * @returns {boolean}
   */
  process(_inputs, outputs, _parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outChannel = output[0];
    let outIndex = 0;

    while (outIndex < outChannel.length) {
      if (!this.current) {
        if (this.queue.length === 0) break;
        this.current = this.queue.shift();
        this.currentOffset = 0;
      }

      const remaining = this.current.length - this.currentOffset;
      const toWrite = Math.min(remaining, outChannel.length - outIndex);

      for (let i = 0; i < toWrite; i++) {
        outChannel[outIndex + i] = this.current[this.currentOffset + i];
      }

      this.currentOffset += toWrite;
      outIndex += toWrite;

      if (this.currentOffset >= this.current.length) {
        this.current = null;
        this.currentOffset = 0;
      }
    }

    // Fill any remaining silence
    for (let i = outIndex; i < outChannel.length; i++) {
      outChannel[i] = 0;
    }

    // Notify the main thread when playback has drained after receiving audio.
    if (this.hadAudio && this.queue.length === 0 && !this.current && outIndex === 0) {
      this.port.postMessage({ type: 'playback-empty' });
      this.hadAudio = false;
    }

    // Keep alive while the node is connected.
    return true;
  }
}

registerProcessor('practice-audio-processor', PracticeAudioProcessor);
