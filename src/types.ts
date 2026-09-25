import type * as THREE from 'three';
import type { EventBus } from './events/EventBus.js';
import type { ResourceRegistry } from './resources/ResourceRegistry.js';
import type { AssetLoader } from './resources/AssetLoader.js';
import type { CCWebGLEventMap } from './events/EventBus.js';
import type { InputManager } from './input/InputManager.js';

export type QualityTier = 'FULL' | 'REDUCED' | 'FALLBACK';

export interface QualityProfile {
  readonly tier: QualityTier;
  readonly maxDPR: number; // FULL: 2.0, REDUCED: 1.0, FALLBACK: n/a
  readonly postProcessing: boolean; // FULL: true, REDUCED: false, FALLBACK: n/a
  readonly shadows: boolean; // FULL: true, REDUCED: false, FALLBACK: n/a
  readonly particleScale: number; // 0..1
  readonly throttleHidden: boolean; // REDUCED: true
}

export interface FrameState {
  readonly dt: number; // seconds, clamped (max 0.1, source constant per Mascot3D L131)
  readonly elapsed: number; // seconds since scheduler start
  readonly frame: number; // monotonically incrementing frame count
  readonly now: number; // performance.now() at this tick
}

export interface ViewportState {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly aspect: number;
}

export interface ScrollDriver {
  start(onUpdate: (raw: { y: number; timestamp: number }) => void): void;
  stop(): void;
}

// Literal spec (authoritative, confirmed from the original planning doc).
export interface ScrollState {
  readonly y: number; // raw scroll offset, px
  readonly previousY: number; // y value from the prior sample (== y on first sample)
  readonly velocity: number; // px/sec, derived from y delta / dt
  readonly direction: -1 | 0 | 1; // sign of velocity
  readonly progress: number; // 0..1, y / (scrollable range), 0 if range is 0
  readonly isScrolling: boolean; // true while scroll is actively changing; debounced
  // false after SCROLL_IDLE_MS (150ms, see ScrollBridge) of no new samples
  readonly timestamp: number; // raw sample timestamp (ms) from ScrollDriver's payload
}

// Literal spec (authoritative, confirmed from the original planning doc).
export interface Scene {
  init(ctx: SceneContext): void | Promise<void>;
  load?(ctx: SceneContext): Promise<void>;
  mount?(ctx: SceneContext): void;
  update(frame: FrameState): void;
  resize(viewport: ViewportState): void;
  pause?(): void;
  resume?(): void;
  dispose(): void;
}

// Literal spec (authoritative, confirmed from the original planning doc). `scene`
// (THREE.Scene) and `viewport` are kept beyond the literal fields — SceneManager needs
// `scene` to render, and `viewport` carries the init-time value; authoritative updates
// after mount flow through Scene.resize() instead of a mutated ctx field. See README
// "Known deviations".
export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  viewport: ViewportState;
  resources: ResourceRegistry;
  assets: AssetLoader;
  events: EventBus<CCWebGLEventMap>;
  input: InputManager;
  scroll: ScrollState;
  quality: QualityProfile;
}
