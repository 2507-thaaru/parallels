import { AudioRecipe, ReverbParams } from './types';
import { generateImpulseResponse } from './impulseResponse';

export interface LivePreviewState {
  isPlaying: boolean;
  isLooping: boolean;
  currentTime: number;
  duration: number;
}

export class LivePreviewEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private wetFilter: BiquadFilterNode | null = null;

  private recipe: AudioRecipe = {
    speed: 0.85,
    reverb: {
      wet: 0.4,
      decaySeconds: 2.5,
      predelayMs: 20,
      lowpassHz: 6000
    }
  };

  private isLooping = false;
  private isPlaying = false;
  private startedAt = 0; // context.currentTime when current playback started
  private startOffset = 0; // offset in source seconds where playback began
  private animationFrameId: number | null = null;
  private listeners: Set<(state: LivePreviewState) => void> = new Set();

  constructor() {
    // Context is lazily initialized upon first user interaction to comply with browser autoplay policies
  }

  public getAudioContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    return this.ctx;
  }

  public setAudioBuffer(buffer: AudioBuffer): void {
    const wasPlaying = this.isPlaying;
    this.stop();
    this.buffer = buffer;
    this.startOffset = 0;
    this.notifyState();
    if (wasPlaying) {
      this.play();
    }
  }

  public subscribe(listener: (state: LivePreviewState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): LivePreviewState {
    return {
      isPlaying: this.isPlaying,
      isLooping: this.isLooping,
      currentTime: this.getCurrentTime(),
      duration: this.buffer ? this.buffer.duration : 0
    };
  }

  private notifyState(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  public getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx || !this.buffer) {
      return this.startOffset;
    }
    const elapsedRealTime = this.ctx.currentTime - this.startedAt;
    const elapsedAudioTime = elapsedRealTime * this.recipe.speed;
    const current = this.startOffset + elapsedAudioTime;

    if (this.isLooping && this.buffer.duration > 0) {
      return current % this.buffer.duration;
    }
    return Math.min(current, this.buffer.duration);
  }

  public async play(offsetSeconds?: number): Promise<void> {
    if (!this.buffer) return;

    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (this.isPlaying) {
      this.stop();
    }

    if (offsetSeconds !== undefined) {
      this.startOffset = Math.max(0, Math.min(offsetSeconds, this.buffer.duration));
    }

    // Build audio routing graph
    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.recipe.speed;
    this.source.loop = this.isLooping;

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1.0;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = this.recipe.reverb ? this.recipe.reverb.wet : 0.0;

    this.convolver = ctx.createConvolver();
    this.updateReverbImpulse();

    this.wetFilter = ctx.createBiquadFilter();
    this.wetFilter.type = 'lowpass';
    if (this.recipe.reverb?.lowpassHz) {
      this.wetFilter.frequency.value = this.recipe.reverb.lowpassHz;
    } else {
      this.wetFilter.frequency.value = 20000;
    }

    // Connect dry
    this.source.connect(this.dryGain);
    this.dryGain.connect(ctx.destination);

    // Connect wet
    this.source.connect(this.convolver);
    this.convolver.connect(this.wetFilter);
    this.wetFilter.connect(this.wetGain);
    this.wetGain.connect(ctx.destination);

    this.startedAt = ctx.currentTime;
    this.source.start(0, this.startOffset);
    this.isPlaying = true;

    this.source.onended = () => {
      // If stopped naturally without loop
      if (!this.isLooping && this.isPlaying) {
        this.stop();
        this.startOffset = 0;
        this.notifyState();
      }
    };

    this.startTracking();
    this.notifyState();
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.startOffset = this.getCurrentTime();
    this.stopNodes();
    this.isPlaying = false;
    this.stopTracking();
    this.notifyState();
  }

  public stop(): void {
    this.stopNodes();
    this.isPlaying = false;
    this.stopTracking();
    this.notifyState();
  }

  public seek(seconds: number): void {
    if (!this.buffer) return;
    const clamped = Math.max(0, Math.min(seconds, this.buffer.duration));
    this.startOffset = clamped;

    if (this.isPlaying) {
      this.play(clamped);
    } else {
      this.notifyState();
    }
  }

  public setLoop(loop: boolean): void {
    this.isLooping = loop;
    if (this.source) {
      this.source.loop = loop;
    }
    this.notifyState();
  }

  public setSpeed(speed: number): void {
    const clamped = Math.max(0.5, Math.min(2.0, speed));
    if (this.isPlaying && this.ctx) {
      // Re-anchor offset calculation before changing playbackRate to avoid jumps
      this.startOffset = this.getCurrentTime();
      this.startedAt = this.ctx.currentTime;
      if (this.source) {
        this.source.playbackRate.setValueAtTime(clamped, this.ctx.currentTime);
      }
    }
    this.recipe.speed = clamped;
  }

  public setReverbParams(params: ReverbParams | null): void {
    this.recipe.reverb = params;
    if (!this.ctx) return;

    if (!params || params.wet <= 0) {
      if (this.wetGain) {
        this.wetGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      return;
    }

    if (this.wetGain) {
      this.wetGain.gain.setValueAtTime(params.wet, this.ctx.currentTime);
    }

    if (this.wetFilter && params.lowpassHz) {
      this.wetFilter.frequency.setValueAtTime(params.lowpassHz, this.ctx.currentTime);
    }

    this.updateReverbImpulse();
  }

  public getRecipe(): AudioRecipe {
    return JSON.parse(JSON.stringify(this.recipe));
  }

  private updateReverbImpulse(): void {
    if (!this.ctx || !this.convolver || !this.recipe.reverb) return;
    try {
      this.convolver.buffer = generateImpulseResponse(
        this.ctx,
        this.recipe.reverb.decaySeconds,
        this.recipe.reverb.predelayMs,
        this.recipe.reverb.lowpassHz
      );
    } catch {
      // In case context is not running yet
    }
  }

  private stopNodes(): void {
    if (this.source) {
      try {
        this.source.stop();
        this.source.disconnect();
      } catch {
        // already stopped
      }
      this.source = null;
    }
    if (this.dryGain) {
      this.dryGain.disconnect();
      this.dryGain = null;
    }
    if (this.wetGain) {
      this.wetGain.disconnect();
      this.wetGain = null;
    }
    if (this.convolver) {
      this.convolver.disconnect();
      this.convolver = null;
    }
    if (this.wetFilter) {
      this.wetFilter.disconnect();
      this.wetFilter = null;
    }
  }

  private startTracking(): void {
    this.stopTracking();
    const update = () => {
      this.notifyState();
      if (this.isPlaying) {
        this.animationFrameId = requestAnimationFrame(update);
      }
    };
    this.animationFrameId = requestAnimationFrame(update);
  }

  private stopTracking(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
