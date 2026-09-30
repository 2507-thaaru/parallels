export interface ReverbParams {
  /** Reverb wet mix level from 0.0 (dry only) to 1.0 (fully wet). null or 0 disables reverb */
  wet: number;
  /** Reverb decay time in seconds (RT60) */
  decaySeconds: number;
  /** Pre-delay time in milliseconds before reverb tail begins */
  predelayMs: number;
  /** Optional lowpass filter cutoff frequency in Hz to dampen high frequencies */
  lowpassHz?: number | null;
}

export interface AudioRecipe {
  /** Playback speed / pitch rate (0.5 to 2.0). 1.0 is original. */
  speed: number;
  /** Reverb settings, or null if reverb is disabled */
  reverb: ReverbParams | null;
}

export interface RenderResult {
  /** Rendered audio as a 16-bit PCM WAV Blob */
  blob: Blob;
  /** URL created via URL.createObjectURL(blob) */
  objectUrl: string;
  /** Total duration of rendered audio in seconds */
  durationSec: number;
  /** Sample rate used for rendering (Hz) */
  sampleRate: number;
  /** Number of audio channels (typically 2 for stereo) */
  channels: number;
}

export type RenderProgressCallback = (progress: number) => void;
