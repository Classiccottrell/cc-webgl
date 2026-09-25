import * as THREE from 'three';
import type { QualityProfile } from '../types.js';

/** WebGLRenderer ctor/config, DPR clamp, canvas mount, context-loss recovery.
 * Ports Mascot3D L23-27 (ctor) and L151-180's renderer teardown
 * (dispose + forceContextLoss + removeChild) into destroy(). */
export class RendererManager {
  readonly renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private onContextLost?: (e: Event) => void;
  private onContextRestored?: (e: Event) => void;

  constructor(
    container: HTMLElement,
    quality: QualityProfile,
    opts?: {
      onContextLost?: (canvas: HTMLCanvasElement) => void;
      onContextRestored?: (canvas: HTMLCanvasElement) => void;
    }
  ) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearAlpha(0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxDPR));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    if (opts?.onContextLost) {
      this.onContextLost = (e: Event) => {
        e.preventDefault();
        opts.onContextLost!(this.renderer.domElement);
      };
      this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    }
    if (opts?.onContextRestored) {
      this.onContextRestored = () => opts.onContextRestored!(this.renderer.domElement);
      this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    }
  }

  setQuality(quality: QualityProfile): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxDPR));
    this.renderer.shadowMap.enabled = quality.shadows;
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  /** Render only if container has non-zero dimensions (Mascot3D L145-147). */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.container.clientWidth > 0 && this.container.clientHeight > 0) {
      this.renderer.render(scene, camera);
    }
  }

  destroy(): void {
    if (this.onContextLost) this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    if (this.onContextRestored) this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
