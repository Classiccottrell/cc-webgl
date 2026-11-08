import type { QualityProfile } from '../types.js';

export interface MatterQuality {
  /** Multiply the chosen particle count by this. */
  particleScale: number;
  /** Whether to run the FluidPass at all; without it Liquid falls back to sprites. */
  fluid: boolean;
  /** FluidPass `resolution`. */
  fluidResolution: number;
  /** FluidPass `blurRounds`. */
  blurRounds: number;
}

/** Maps a cc-webgl quality profile onto matter settings. */
export function matterQuality(profile: QualityProfile): MatterQuality {
  switch (profile.tier) {
    case 'FULL':
      return { particleScale: profile.particleScale, fluid: true, fluidResolution: 1, blurRounds: 5 };
    case 'REDUCED':
      return { particleScale: profile.particleScale, fluid: true, fluidResolution: 0.5, blurRounds: 3 };
    case 'FALLBACK':
      return { particleScale: profile.particleScale, fluid: false, fluidResolution: 0.5, blurRounds: 0 };
  }
}
