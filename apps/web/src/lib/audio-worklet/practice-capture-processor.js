/**
 * AudioWorkletProcessor that captures microphone input as PCM16 and posts
 * base64-encoded chunks back to the main thread.
 *
 * Messages from the main thread:
 *   { type: 'start' }  -> start capturing
 *   { type: 'stop' }   -> stop capturing
 */

/**
 * Convert a Float32Array of [-1, 1] samples to signed 16-bit PCM Int16Array.
 * @param {Float32Array} input
 * @returns {Int16Array}
 */
function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

/**
 * Encode an ArrayBuffer as a base64 string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

class PracticeCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isCapturing = false;

    this.port.onmessage = (event) => {
      const { type } = event.data;
      if (type === "start") {
        this.isCapturing = true;
      } else if (type === "stop") {
        this.isCapturing = false;
      }
    };
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} _outputs
   * @param {Record<string, Float32Array>} _parameters
   * @returns {boolean}
   */
  process(inputs, _outputs, _parameters) {
    if (!this.isCapturing) return true;

    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    const pcm16 = floatTo16BitPCM(channelData);
    const base64 = arrayBufferToBase64(pcm16.buffer);

    this.port.postMessage({ type: "audio", base64 });
    return true;
  }
}

registerProcessor("practice-capture-processor", PracticeCaptureProcessor);
