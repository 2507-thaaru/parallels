import { describe, it, expect } from 'vitest';
import { encodeWavArrayBuffer } from '../../src/core/audio/wavEncoder';

describe('WAV Encoder', () => {
  it('should encode stereo PCM audio with valid 44-byte WAV header and correct metadata', () => {
    const sampleRate = 44100;
    const numSamples = 1000;
    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);

    // Populate with test values
    left[0] = 0.0;
    left[1] = 0.5;
    left[2] = 1.0;
    left[3] = -1.0;
    right[0] = 0.0;
    right[1] = -0.5;
    right[2] = -1.0;
    right[3] = 1.0;

    const buffer = encodeWavArrayBuffer([left, right], sampleRate);
    const view = new DataView(buffer);

    // Expected byte sizes
    const expectedDataSize = numSamples * 2 * 2; // samples * channels * bytesPerSample
    const expectedFileSize = 44 + expectedDataSize;

    expect(buffer.byteLength).toBe(expectedFileSize);

    // Helper to read ASCII
    const readString = (offset: number, length: number) => {
      let str = '';
      for (let i = 0; i < length; i++) {
        str += String.fromCharCode(view.getUint8(offset + i));
      }
      return str;
    };

    // RIFF Chunk Descriptor
    expect(readString(0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + expectedDataSize);
    expect(readString(8, 4)).toBe('WAVE');

    // "fmt " Sub-chunk
    expect(readString(12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16); // SubChunk1Size for PCM
    expect(view.getUint16(20, true)).toBe(1); // AudioFormat = 1 (PCM)
    expect(view.getUint16(22, true)).toBe(2); // NumChannels = 2
    expect(view.getUint32(24, true)).toBe(sampleRate); // SampleRate
    expect(view.getUint32(28, true)).toBe(sampleRate * 2 * 2); // ByteRate = 176400
    expect(view.getUint16(32, true)).toBe(4); // BlockAlign = 4
    expect(view.getUint16(34, true)).toBe(16); // BitsPerSample = 16

    // "data" Sub-chunk
    expect(readString(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(expectedDataSize);

    // Verify sample conversion (offset 44)
    // sample 0: L=0, R=0
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0);

    // sample 1: L=0.5 -> ~16384, R=-0.5 -> -16384
    expect(Math.abs(view.getInt16(48, true) - 16384)).toBeLessThanOrEqual(1);
    expect(Math.abs(view.getInt16(50, true) - -16384)).toBeLessThanOrEqual(1);

    // sample 2: L=1.0 -> 32767, R=-1.0 -> -32768
    expect(view.getInt16(52, true)).toBe(32767);
    expect(view.getInt16(54, true)).toBe(-32768);
  });

  it('should handle mono channels cleanly', () => {
    const sampleRate = 48000;
    const numSamples = 500;
    const mono = new Float32Array(numSamples);
    mono[0] = 0.5;

    const buffer = encodeWavArrayBuffer([mono], sampleRate);
    const view = new DataView(buffer);

    expect(view.getUint16(22, true)).toBe(1); // 1 channel
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(48000 * 2); // ByteRate
    expect(view.getUint16(32, true)).toBe(2); // BlockAlign
    expect(view.getUint32(40, true)).toBe(numSamples * 2);
  });

  it('should throw when no channels provided', () => {
    expect(() => encodeWavArrayBuffer([], 44100)).toThrow();
  });
});
