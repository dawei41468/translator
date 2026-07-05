import { describe, it, expect } from "vitest";
import { decodeBase64ToPCM16, pcm16ToFloat32 } from "../audio-utils";

describe("audio-utils", () => {
  describe("decodeBase64ToPCM16", () => {
    it("decodes a known base64 string to the correct PCM16 samples", () => {
      // Int16Array is platform-endian (little-endian on x86/ARM).
      // Two PCM16 samples: 0x1234 and 0x5678 represented as little-endian bytes.
      const base64 = btoa(String.fromCharCode(0x34, 0x12, 0x78, 0x56));
      const pcm16 = decodeBase64ToPCM16(base64);

      expect(pcm16).toBeInstanceOf(Int16Array);
      expect(pcm16.length).toBe(2);
      expect(pcm16[0]).toBe(0x1234);
      expect(pcm16[1]).toBe(0x5678);
    });

    it("handles negative PCM16 values", () => {
      // -1 as little-endian signed 16-bit = 0xff, 0xff; -256 = 0x00, 0xff
      const base64 = btoa(String.fromCharCode(0xff, 0xff, 0x00, 0xff));
      const pcm16 = decodeBase64ToPCM16(base64);

      expect(pcm16.length).toBe(2);
      expect(pcm16[0]).toBe(-1);
      expect(pcm16[1]).toBe(-256);
    });

    it("decodes silence (all zeros) correctly", () => {
      const base64 = btoa("\x00\x00\x00\x00");
      const pcm16 = decodeBase64ToPCM16(base64);

      expect(pcm16.length).toBe(2);
      expect(pcm16[0]).toBe(0);
      expect(pcm16[1]).toBe(0);
    });
  });

  describe("pcm16ToFloat32", () => {
    it("normalizes max positive value to near 1.0", () => {
      const float32 = pcm16ToFloat32(new Int16Array([32767]));
      expect(float32[0]).toBeCloseTo(0.99997, 5);
    });

    it("normalizes min negative value to -1.0", () => {
      const float32 = pcm16ToFloat32(new Int16Array([-32768]));
      expect(float32[0]).toBeCloseTo(-1.0, 5);
    });

    it("normalizes silence to 0.0", () => {
      const float32 = pcm16ToFloat32(new Int16Array([0, 0, 0]));
      expect(float32[0]).toBe(0);
      expect(float32[1]).toBe(0);
      expect(float32[2]).toBe(0);
    });

    it("round-trips through decode and conversion", () => {
      const pcm16 = new Int16Array([0, 16384, -16384, 32767, -32768]);
      const base64 = btoa(
        Array.from(pcm16)
          .map((sample) =>
            String.fromCharCode(sample & 0xff, (sample >> 8) & 0xff)
          )
          .join("")
      );
      const decoded = decodeBase64ToPCM16(base64);
      const float32 = pcm16ToFloat32(decoded);

      expect(float32.length).toBe(pcm16.length);
      expect(float32[0]).toBe(0);
      expect(float32[1]).toBeCloseTo(0.5, 5);
      expect(float32[2]).toBeCloseTo(-0.5, 5);
      expect(float32[3]).toBeCloseTo(0.99997, 5);
      expect(float32[4]).toBeCloseTo(-1.0, 5);
    });
  });
});
