import type { ViewportState } from '../types.js';

/** ResizeObserver, enqueues resize eval into FrameScheduler (no own rAF).
 * Keeps Mascot3D L103-112's `clientWidth === 0 || clientHeight === 0` bail. */
export class ResizeManager {
  private container: HTMLElement;
  private observer: ResizeObserver;
  private pending = false;
  private onResize: (viewport: ViewportState) => void;
  private maxDPR: number;

  constructor(container: HTMLElement, onResize: (viewport: ViewportState) => void, maxDPR = 2) {
    this.container = container;
    this.onResize = onResize;
    this.maxDPR = maxDPR;
    this.observer = new ResizeObserver(() => {
      this.pending = true;
    });
    this.observer.observe(container);
    this.pending = true; // evaluate once on construction
  }

  setMaxDPR(maxDPR: number): void {
    this.maxDPR = maxDPR;
  }

  /** Call once per FrameScheduler tick; only does work if a resize is pending. */
  evaluate(): void {
    if (!this.pending) return;
    this.pending = false;
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    const dpr = Math.min(window.devicePixelRatio, this.maxDPR);
    this.onResize({ width: clientWidth, height: clientHeight, dpr, aspect: clientWidth / clientHeight });
  }

  destroy(): void {
    this.observer.disconnect();
  }
}
