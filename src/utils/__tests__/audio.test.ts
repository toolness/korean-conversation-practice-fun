import { describe, it, expect } from "bun:test";
import { downsample, encodeWAV } from "../audio";

describe("downsample", () => {
  it("returns same samples when rates match", () => {
    const samples = new Float32Array([1, 2, 3]);
    const result = downsample(samples, 16000, 16000);
    expect(result).toBe(samples);
  });

  it("halves length when downsampling 2:1", () => {
    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const result = downsample(samples, 48000, 24000);
    expect(result.length).toBe(3);
    expect(result).toBeInstanceOf(Float32Array);
  });

  it("preserves values at sampled positions", () => {
    const samples = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    const result = downsample(samples, 32000, 16000);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(0.5);
    expect(result[1]).toBe(0.5);
  });
});

describe("encodeWAV", () => {
  it("returns a Blob with audio/wav type", () => {
    const samples = new Float32Array([0, 0.5, -0.5]);
    const blob = encodeWAV(samples, 16000);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("audio/wav");
  });

  it("has correct byte size (44 header + 2 bytes per sample)", () => {
    const samples = new Float32Array(100);
    const blob = encodeWAV(samples, 16000);
    expect(blob.size).toBe(44 + 100 * 2);
  });

  it("starts with RIFF header", async () => {
    const samples = new Float32Array([0]);
    const blob = encodeWAV(samples, 16000);
    const buf = await blob.arrayBuffer();
    const header = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
    expect(header).toBe("RIFF");
  });

  it("contains WAVE format marker", async () => {
    const samples = new Float32Array([0]);
    const blob = encodeWAV(samples, 16000);
    const buf = await blob.arrayBuffer();
    const marker = new TextDecoder().decode(new Uint8Array(buf, 8, 4));
    expect(marker).toBe("WAVE");
  });

  it("encodes sample rate in header", async () => {
    const samples = new Float32Array([0]);
    const blob = encodeWAV(samples, 44100);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    expect(view.getUint32(24, true)).toBe(44100);
  });

  it("clamps samples to [-1, 1]", async () => {
    const samples = new Float32Array([2.0, -2.0]);
    const blob = encodeWAV(samples, 16000);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });
});
