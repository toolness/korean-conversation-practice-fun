import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downsample, encodeWAV, parseHash } from './utils.js';

describe('downsample', () => {
  it('returns same samples when rates match', () => {
    const samples = new Float32Array([1, 2, 3]);
    const result = downsample(samples, 16000, 16000);
    assert.strictEqual(result, samples);
  });

  it('halves length when downsampling 2:1', () => {
    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const result = downsample(samples, 48000, 24000);
    assert.strictEqual(result.length, 3);
    assert.ok(result instanceof Float32Array);
  });

  it('preserves values at sampled positions', () => {
    const samples = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    const result = downsample(samples, 32000, 16000);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0], 0.5);
    assert.strictEqual(result[1], 0.5);
  });
});

describe('encodeWAV', () => {
  it('returns a Blob with audio/wav type', () => {
    const samples = new Float32Array([0, 0.5, -0.5]);
    const blob = encodeWAV(samples, 16000);
    assert.ok(blob instanceof Blob);
    assert.strictEqual(blob.type, 'audio/wav');
  });

  it('has correct byte size (44 header + 2 bytes per sample)', () => {
    const samples = new Float32Array(100);
    const blob = encodeWAV(samples, 16000);
    assert.strictEqual(blob.size, 44 + 100 * 2);
  });

  it('starts with RIFF header', async () => {
    const samples = new Float32Array([0]);
    const blob = encodeWAV(samples, 16000);
    const buf = await blob.arrayBuffer();
    const header = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
    assert.strictEqual(header, 'RIFF');
  });

  it('contains WAVE format marker', async () => {
    const samples = new Float32Array([0]);
    const blob = encodeWAV(samples, 16000);
    const buf = await blob.arrayBuffer();
    const marker = new TextDecoder().decode(new Uint8Array(buf, 8, 4));
    assert.strictEqual(marker, 'WAVE');
  });

  it('encodes sample rate in header', async () => {
    const samples = new Float32Array([0]);
    const blob = encodeWAV(samples, 44100);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    assert.strictEqual(view.getUint32(24, true), 44100);
  });

  it('clamps samples to [-1, 1]', async () => {
    const samples = new Float32Array([2.0, -2.0]);
    const blob = encodeWAV(samples, 16000);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    assert.strictEqual(view.getInt16(44, true), 32767);
    assert.strictEqual(view.getInt16(46, true), -32768);
  });
});

describe('parseHash', () => {
  it('returns select screen for empty hash', () => {
    assert.deepStrictEqual(parseHash(''), { screen: 'select', scenarioId: null });
    assert.deepStrictEqual(parseHash('#'), { screen: 'select', scenarioId: null });
  });

  it('parses conversation screen with scenario id', () => {
    assert.deepStrictEqual(
      parseHash('#conversation/unit9_phone_caller'),
      { screen: 'conversation', scenarioId: 'unit9_phone_caller' }
    );
  });

  it('maps briefing to conversation', () => {
    assert.deepStrictEqual(
      parseHash('#briefing/unit9_phone_caller'),
      { screen: 'conversation', scenarioId: 'unit9_phone_caller' }
    );
  });

  it('handles hash with leading slash', () => {
    assert.deepStrictEqual(
      parseHash('#/conversation/unit9_phone_caller'),
      { screen: 'conversation', scenarioId: 'unit9_phone_caller' }
    );
  });

  it('returns null scenarioId when no id in hash', () => {
    assert.deepStrictEqual(
      parseHash('#select'),
      { screen: 'select', scenarioId: null }
    );
  });
});
