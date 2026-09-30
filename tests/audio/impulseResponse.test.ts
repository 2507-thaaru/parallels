import { describe, it, expect } from 'vitest';
import { generateRawImpulseResponse } from '../../src/core/audio/impulseResponse';

describe('Impulse Response Generator', () => {
  it('should generate stereo channels of correct sample length for given decay and sampleRate', () => {
    const decaySeconds = 2.0;
    const predelayMs = 50;
    const sampleRate = 44100;

    const [left, right] = generateRawImpulseResponse(decaySeconds, predelayMs, sampleRate);

    const expectedSamples = Math.floor(sampleRate * (decaySeconds + predelayMs / 1000));
    expect(left.length).toBe(expectedSamples);
    expect(right.length).toBe(expectedSamples);
  });

  it('should have silence during pre-delay period', () => {
    const decaySeconds = 1.0;
    const predelayMs = 100;
    const sampleRate = 44100;
    const predelaySamples = Math.floor(sampleRate * (predelayMs / 1000));

    const [left, right] = generateRawImpulseResponse(decaySeconds, predelayMs, sampleRate);

    for (let i = 0; i < predelaySamples; i++) {
      expect(left[i]).toBe(0);
      expect(right[i]).toBe(0);
    }

    // Immediately after pre-delay, there should be non-zero noise
    let hasSignalAfter = false;
    for (let i = predelaySamples; i < predelaySamples + 100; i++) {
      if (left[i] !== 0 || right[i] !== 0) {
        hasSignalAfter = true;
        break;
      }
    }
    expect(hasSignalAfter).toBe(true);
  });

  it('should have decorrelated left and right stereo channels (independent noise)', () => {
    const [left, right] = generateRawImpulseResponse(1.5, 0, 44100);

    // Left and right channels should not be identical
    let differences = 0;
    for (let i = 0; i < 500; i++) {
      if (left[i] !== right[i]) differences++;
    }
    expect(differences).toBeGreaterThan(450);
  });

  it('should exponentially decay over time', () => {
    const [left] = generateRawImpulseResponse(2.0, 0, 44100);

    // Calculate RMS energy in first 100ms vs last 100ms
    const windowSize = 4410; // 100ms at 44.1kHz
    let earlyEnergy = 0;
    let lateEnergy = 0;

    for (let i = 0; i < windowSize; i++) {
      earlyEnergy += left[i] * left[i];
      lateEnergy += left[left.length - windowSize + i] * left[left.length - windowSize + i];
    }

    expect(earlyEnergy).toBeGreaterThan(lateEnergy * 50);
  });
});
