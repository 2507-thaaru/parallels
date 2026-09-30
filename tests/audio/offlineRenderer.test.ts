import { describe, it, expect } from 'vitest';
import { calculateRenderDuration } from '../../src/core/audio/offlineRenderer';

describe('Offline Renderer Duration Math', () => {
  it('should calculate duration correctly for slowed playback (0.85x)', () => {
    const sourceDuration = 100; // seconds
    const speed = 0.85;
    const duration = calculateRenderDuration(sourceDuration, speed, null);

    expect(duration).toBeCloseTo(100 / 0.85, 4);
    expect(duration).toBeGreaterThan(100);
  });

  it('should calculate duration correctly for sped up playback (1.5x)', () => {
    const sourceDuration = 120;
    const speed = 1.5;
    const duration = calculateRenderDuration(sourceDuration, speed, null);

    expect(duration).toBeCloseTo(120 / 1.5, 4);
    expect(duration).toBe(80);
  });

  it('should add reverb decay and predelay tails to output duration when reverb wet > 0', () => {
    const sourceDuration = 60;
    const speed = 0.8; // 60 / 0.8 = 75s
    const reverb = {
      wet: 0.5,
      decaySeconds: 3.5,
      predelayMs: 50
    };

    const duration = calculateRenderDuration(sourceDuration, speed, reverb);
    const expected = 75 + 3.5 + 0.05; // 78.55s

    expect(duration).toBeCloseTo(expected, 4);
  });

  it('should not add reverb tail if reverb wet is 0', () => {
    const sourceDuration = 60;
    const speed = 1.0;
    const reverb = {
      wet: 0,
      decaySeconds: 4.0,
      predelayMs: 100
    };

    const duration = calculateRenderDuration(sourceDuration, speed, reverb);
    expect(duration).toBe(60);
  });

  it('should throw on non-positive speed', () => {
    expect(() => calculateRenderDuration(100, 0, null)).toThrow();
    expect(() => calculateRenderDuration(100, -1, null)).toThrow();
  });
});
