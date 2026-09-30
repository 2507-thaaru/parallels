import { AudioRecipe, ReverbParams, RenderResult } from './types';
import { generateImpulseResponse } from './impulseResponse';
import { encodeAudioBufferToWavBlob } from './wavEncoder';

/**
 * Calculates the exact output duration in seconds for a rendered audio recipe.
 *
 * @param sourceDuration - Length of source audio in seconds
 * @param speed - Playback rate / speed factor (e.g. 0.85)
 * @param reverb - Reverb configuration, or null if disabled
 * @returns Total duration in seconds including reverb tail
 */
export function calculateRenderDuration(
  sourceDuration: number,
  speed: number,
  reverb: ReverbParams | null
): number {
  if (speed <= 0) {
    throw new Error('Speed must be positive');
  }

  const stretchedDuration = sourceDuration / speed;

  if (reverb && reverb.wet > 0) {
    const reverbTail = (reverb.predelayMs / 1000) + reverb.decaySeconds;
    return stretchedDuration + reverbTail;
  }

  return stretchedDuration;
}

/**
 * Renders an AudioBuffer with pitch-linked speed alteration and synthetic reverb
 * to a standalone 16-bit PCM WAV Blob using OfflineAudioContext.
 *
 * @param sourceBuffer - Decoded original audio buffer
 * @param recipe - Speed and reverb settings
 * @returns RenderResult containing the playable WAV Blob, object URL, and duration
 */
export async function renderAudioRecipe(
  sourceBuffer: AudioBuffer,
  recipe: AudioRecipe
): Promise<RenderResult> {
  const speed = Math.max(0.5, Math.min(2.0, recipe.speed));
  const sampleRate = sourceBuffer.sampleRate;
  const totalDurationSec = calculateRenderDuration(sourceBuffer.duration, speed, recipe.reverb);
  const totalSamples = Math.ceil(totalDurationSec * sampleRate);

  const OfflineContextClass =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  const offlineCtx = new OfflineContextClass(2, totalSamples, sampleRate);

  // 1. Source node
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  source.playbackRate.value = speed;

  // 2. Dry path
  const dryGain = offlineCtx.createGain();
  dryGain.gain.value = 1.0;
  source.connect(dryGain);
  dryGain.connect(offlineCtx.destination);

  // 3. Wet path (reverb)
  if (recipe.reverb && recipe.reverb.wet > 0) {
    const convolver = offlineCtx.createConvolver();
    convolver.buffer = generateImpulseResponse(
      offlineCtx,
      recipe.reverb.decaySeconds,
      recipe.reverb.predelayMs,
      recipe.reverb.lowpassHz
    );

    const wetGain = offlineCtx.createGain();
    wetGain.gain.value = recipe.reverb.wet;

    if (recipe.reverb.lowpassHz && recipe.reverb.lowpassHz > 0) {
      const filter = offlineCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = recipe.reverb.lowpassHz;
      source.connect(convolver);
      convolver.connect(filter);
      filter.connect(wetGain);
    } else {
      source.connect(convolver);
      convolver.connect(wetGain);
    }

    wetGain.connect(offlineCtx.destination);
  }

  // Start rendering
  source.start(0);
  const renderedBuffer = await offlineCtx.startRendering();

  // Encode to 16-bit PCM WAV Blob
  const blob = encodeAudioBufferToWavBlob(renderedBuffer);
  const objectUrl = URL.createObjectURL(blob);

  return {
    blob,
    objectUrl,
    durationSec: renderedBuffer.duration,
    sampleRate,
    channels: 2
  };
}
