/**
 * Generates raw stereo impulse response sample data.
 * Can run in both browser and Node/Vitest environments.
 *
 * @param decaySeconds - RT60 reverb decay time in seconds
 * @param predelayMs - Delay before the reverberation starts in milliseconds
 * @param sampleRate - Sample rate in Hz (e.g., 44100 or 48000)
 * @param lowpassHz - Optional cutoff frequency to dampen highs
 * @returns Array containing Float32Array for [leftChannel, rightChannel]
 */
export function generateRawImpulseResponse(
  decaySeconds: number,
  predelayMs = 0,
  sampleRate = 44100,
  lowpassHz: number | null = null
): [Float32Array, Float32Array] {
  const safeDecay = Math.max(0.01, decaySeconds);
  const safePredelaySec = Math.max(0, predelayMs) / 1000;
  const totalDuration = safePredelaySec + safeDecay;
  const totalSamples = Math.max(2, Math.floor(sampleRate * totalDuration));
  const predelaySamples = Math.min(totalSamples - 1, Math.floor(sampleRate * safePredelaySec));

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  // RT60: amplitude drops to -60dB (0.001) over decaySeconds
  // exp(-k * safeDecay) = 0.001 -> k = -ln(0.001) / safeDecay ~ 6.907755 / safeDecay
  const decayRate = 6.907755 / safeDecay;

  // Single-pole lowpass filter coefficient if lowpassHz is specified
  let filterAlpha = 1.0;
  if (lowpassHz && lowpassHz > 0 && lowpassHz < sampleRate / 2) {
    const dt = 1 / sampleRate;
    const rc = 1 / (2 * Math.PI * lowpassHz);
    filterAlpha = dt / (rc + dt);
  }

  let prevL = 0;
  let prevR = 0;

  for (let i = predelaySamples; i < totalSamples; i++) {
    const t = (i - predelaySamples) / sampleRate;
    const envelope = Math.exp(-decayRate * t);

    // Independent stereo white noise
    let noiseL = (Math.random() * 2 - 1) * envelope;
    let noiseR = (Math.random() * 2 - 1) * envelope;

    if (filterAlpha < 1.0) {
      noiseL = prevL + filterAlpha * (noiseL - prevL);
      noiseR = prevR + filterAlpha * (noiseR - prevR);
      prevL = noiseL;
      prevR = noiseR;
    }

    left[i] = noiseL;
    right[i] = noiseR;
  }

  return [left, right];
}

/**
 * Creates an AudioBuffer containing a synthetic stereo impulse response.
 */
export function generateImpulseResponse(
  audioContext: BaseAudioContext,
  decaySeconds: number,
  predelayMs = 0,
  lowpassHz: number | null = null
): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const [leftData, rightData] = generateRawImpulseResponse(
    decaySeconds,
    predelayMs,
    sampleRate,
    lowpassHz
  );

  const buffer = audioContext.createBuffer(2, leftData.length, sampleRate);
  buffer.getChannelData(0).set(leftData);
  buffer.getChannelData(1).set(rightData);

  return buffer;
}
