import type { QualityProfile, QualityTier } from '../types.js';

const PROFILES: Record<QualityTier, QualityProfile> = {
  FULL: { tier: 'FULL', maxDPR: 2.0, postProcessing: true, shadows: true, particleScale: 1, throttleHidden: false },
  REDUCED: { tier: 'REDUCED', maxDPR: 1.0, postProcessing: false, shadows: false, particleScale: 0.5, throttleHidden: true },
  FALLBACK: { tier: 'FALLBACK', maxDPR: 1.0, postProcessing: false, shadows: false, particleScale: 0, throttleHidden: true },
};

const HYSTERESIS_SAMPLES = 5; // consecutive samples required before a tier downgrade/upgrade
const SLOW_FRAME_MS = 32; // ~30fps
const FAST_FRAME_MS = 14; // ~70fps, headroom before upgrading

export interface QualityManagerOptions {
  capabilityProbe?: () => boolean; // false => no WebGL2 / low-end GPU signal
  reducedMotion?: boolean;
}

/** Tier selection: capability probe + frame-time median + reduced-motion; hysteresis
 * so a single fast/slow frame does not flip tiers. No user-agent sniffing. */
export class QualityManager {
  private tier: QualityTier;
  private samples: number[] = [];
  private consecutiveSlow = 0;
  private consecutiveFast = 0;
  private reducedMotion: boolean;
  private overridden = false; // set by forceTier(); frame-time hysteresis is suspended while true

  constructor(opts?: QualityManagerOptions) {
    this.reducedMotion = opts?.reducedMotion ?? false;
    const hasCapability = opts?.capabilityProbe ? opts.capabilityProbe() : true;
    this.tier = hasCapability ? 'FULL' : 'FALLBACK';
  }

  get profile(): QualityProfile {
    return PROFILES[this.tier];
  }

  setReducedMotion(matches: boolean): void {
    this.reducedMotion = matches;
  }

  /** Manually pin the tier (e.g. a demo/debug UI forcing FULL/REDUCED/FALLBACK).
   * Latches: reportFrameTime() no-ops until releaseOverride() is called, otherwise
   * hysteresis would silently undo the forced tier within a few frames. */
  forceTier(tier: QualityTier): void {
    this.overridden = true;
    this.consecutiveSlow = 0;
    this.consecutiveFast = 0;
    this.setTier(tier);
  }

  releaseOverride(): void {
    this.overridden = false;
  }

  /** Feed a frame time in ms; returns the (possibly unchanged) tier after hysteresis. */
  reportFrameTime(ms: number): QualityTier {
    if (this.overridden) return this.tier; // manual override suspends automatic tiering
    if (this.tier === 'FALLBACK') return this.tier; // FALLBACK is not exited by frame timing

    if (ms >= SLOW_FRAME_MS) {
      this.consecutiveSlow += 1;
      this.consecutiveFast = 0;
    } else if (ms <= FAST_FRAME_MS) {
      this.consecutiveFast += 1;
      this.consecutiveSlow = 0;
    } else {
      this.consecutiveSlow = 0;
      this.consecutiveFast = 0;
    }

    if (this.consecutiveSlow >= HYSTERESIS_SAMPLES && this.tier === 'FULL') {
      this.setTier('REDUCED');
      this.consecutiveSlow = 0;
    } else if (this.consecutiveFast >= HYSTERESIS_SAMPLES && this.tier === 'REDUCED') {
      this.setTier('FULL');
      this.consecutiveFast = 0;
    }
    return this.tier;
  }

  private setTier(next: QualityTier): void {
    this.tier = next;
  }
}
