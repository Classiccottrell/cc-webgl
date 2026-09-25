import * as THREE from 'three';
import type { Scene, SceneContext, QualityTier, ViewportState } from '../types.js';
import { EventBus, type CCWebGLEventMap } from '../events/EventBus.js';
import { ResourceRegistry } from '../resources/ResourceRegistry.js';
import { AssetLoader } from '../resources/AssetLoader.js';
import { RendererManager } from './RendererManager.js';
import { CameraManager } from './CameraManager.js';
import { FrameScheduler } from './FrameScheduler.js';
import { QualityManager } from './QualityManager.js';
import { ResizeManager } from '../input/ResizeManager.js';
import { ScrollBridge } from '../input/ScrollBridge.js';
import { InputManager } from '../input/InputManager.js';
import { probeWebGLCapability, mountFallback } from '../errors/ErrorBoundary.js';

export interface SceneManagerOptions {
  reducedMotion?: boolean;
}

/** Owns Scene lifecycle: init -> load -> mount -> pause/resume -> dispose; wires
 * SceneContext. On FALLBACK tier, never constructs a SceneContext or calls Scene.init —
 * mounts the DOM/SVG fallback directly instead (blueprint §2 FALLBACK resolution). */
export class SceneManager {
  private container: HTMLElement;
  private scene: Scene;
  private context: SceneContext | null = null;
  private rendererManager: RendererManager | null = null;
  private cameraManager: CameraManager | null = null;
  private scheduler: FrameScheduler | null = null;
  private resizeManager: ResizeManager | null = null;
  private scrollBridge: ScrollBridge | null = null;
  private inputManager: InputManager | null = null;
  private quality: QualityManager;
  private events: EventBus<CCWebGLEventMap>;
  private resources: ResourceRegistry;
  private assets: AssetLoader;

  constructor(container: HTMLElement, scene: Scene, opts?: SceneManagerOptions) {
    this.container = container;
    this.scene = scene;
    this.events = new EventBus<CCWebGLEventMap>();
    this.resources = new ResourceRegistry();
    this.assets = new AssetLoader();
    this.quality = new QualityManager({
      capabilityProbe: probeWebGLCapability,
      reducedMotion: opts?.reducedMotion,
    });
  }

  get eventBus(): EventBus<CCWebGLEventMap> {
    return this.events;
  }

  get resourceRegistry(): ResourceRegistry {
    return this.resources;
  }

  get qualityManager(): QualityManager {
    return this.quality;
  }

  async mount(): Promise<void> {
    const profile = this.quality.profile;
    if (profile.tier === 'FALLBACK') {
      mountFallback(this.container);
      return;
    }

    const threeScene = new THREE.Scene();
    this.cameraManager = new CameraManager();
    this.rendererManager = new RendererManager(this.container, profile, {
      onContextLost: (canvas) => this.events.emit('context-lost', { canvas }),
      onContextRestored: (canvas) => this.events.emit('context-restored', { canvas }),
    });
    this.scrollBridge = new ScrollBridge();
    this.scrollBridge.start();
    this.inputManager = new InputManager(this.container);
    this.scheduler = new FrameScheduler();

    const viewport: ViewportState = {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      dpr: Math.min(window.devicePixelRatio, profile.maxDPR),
      aspect: this.container.clientWidth / Math.max(this.container.clientHeight, 1),
    };
    this.cameraManager.updateViewport(viewport);

    // Single stable SceneContext object for the mount's lifetime — Scene implementations
    // capture `ctx` once (via init/load/mount) per the corrected Scene interface, which
    // no longer passes ctx to update/dispose. Per-frame-changing fields (viewport, scroll)
    // are mutated in place on this same object, never replaced.
    this.context = {
      scene: threeScene,
      camera: this.cameraManager.camera,
      renderer: this.rendererManager.renderer,
      viewport,
      quality: profile,
      scroll: this.scrollBridge.scroll,
      resources: this.resources,
      assets: this.assets,
      events: this.events,
      input: this.inputManager,
    };

    this.resizeManager = new ResizeManager(
      this.container,
      (vp) => {
        this.context!.viewport = vp;
        this.cameraManager!.updateViewport(vp);
        this.rendererManager!.setSize(vp.width, vp.height);
        this.scene.resize(vp);
        this.events.emit('resize', vp);
      },
      profile.maxDPR
    );

    await this.scene.init(this.context);
    if (this.scene.load) await this.scene.load(this.context);
    if (this.scene.mount) this.scene.mount(this.context);

    this.scheduler.addTask((frame) => {
      this.resizeManager!.evaluate();
      this.context!.scroll = this.scrollBridge!.scroll;
      this.context!.quality = this.quality.profile;
      this.quality.reportFrameTime(frame.dt * 1000);
      this.scene.update(frame);
      this.rendererManager!.render(this.context!.scene, this.context!.camera);
    });
    this.scheduler.start();
  }

  /** Force a quality tier at runtime (demo/debug UI use). No-op transition into the
   * tier the scene is already on. Live-tier is not FALLBACK<->FULL/REDUCED-capable
   * in-place (FALLBACK never constructs a WebGL context) — caller must dispose() and
   * re-mount() to cross that boundary; this method only adjusts DPR/shadows for an
   * already-live WebGL mount. */
  setQualityTier(tier: QualityTier): void {
    if (tier === 'FALLBACK' && this.rendererManager) {
      throw new Error('SceneManager: dispose and remount to enter FALLBACK');
    }
    this.quality.forceTier(tier);
    if (!this.rendererManager || !this.resizeManager) return; // FALLBACK mount, nothing live to update
    const profile = this.quality.profile;
    this.rendererManager.setQuality(profile);
    this.resizeManager.setMaxDPR(profile.maxDPR);
  }

  pause(): void {
    this.scheduler?.stop();
    this.scene.pause?.();
  }

  resume(): void {
    this.scheduler?.start();
    this.scene.resume?.();
  }

  dispose(): void {
    this.scheduler?.stop();
    this.resizeManager?.destroy();
    this.scrollBridge?.stop();
    this.inputManager?.destroy();
    if (this.context) this.scene.dispose();
    this.resources.disposeAll();
    this.rendererManager?.destroy();
    this.events.clear();
    this.context = null;
  }
}
