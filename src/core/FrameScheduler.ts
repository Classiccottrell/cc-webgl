import type { FrameState } from '../types.js';

const DT_CLAMP_SECONDS = 0.1; // Mascot3D L131

export type FrameTask = (frame: FrameState) => void;

/** THE single rAF loop for the whole package. Clamped dt; visibility pause; ordered
 * phase execution (input -> scroll -> animation -> scene.update -> render, per
 * blueprint §5). Public shape mirrors linefield/shared/anim.js's createLoop
 * (start/stop/setSpeed/isRunning) but adds dt clamp + visibilitychange pause, neither
 * present in that source. */
export class FrameScheduler {
  private tasks: FrameTask[] = [];
  private rafId: number | null = null;
  private lastTime = 0;
  private elapsed = 0;
  private frame = 0;
  private speed = 1;
  private _isRunning = false;
  private visibilityHandler = () => this.handleVisibilityChange();
  private raf: (cb: FrameRequestCallback) => number;
  private caf: (id: number) => void;
  private now: () => number;

  constructor(opts?: {
    requestAnimationFrame?: (cb: FrameRequestCallback) => number;
    cancelAnimationFrame?: (id: number) => void;
    now?: () => number;
  }) {
    this.raf = opts?.requestAnimationFrame ?? globalThis.requestAnimationFrame?.bind(globalThis);
    this.caf = opts?.cancelAnimationFrame ?? globalThis.cancelAnimationFrame?.bind(globalThis);
    this.now = opts?.now ?? (() => performance.now());
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  addTask(task: FrameTask): () => void {
    this.tasks.push(task);
    return () => {
      const idx = this.tasks.indexOf(task);
      if (idx !== -1) this.tasks.splice(idx, 1);
    };
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this.lastTime = this.now();
    this.elapsed = 0;
    this.frame = 0;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    this.rafId = this.raf(this.tick);
  }

  stop(): void {
    this._isRunning = false;
    if (this.rafId !== null) {
      this.caf(this.rafId);
      this.rafId = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private tick = (): void => {
    if (!this._isRunning) return;
    const now = this.now();
    const rawDt = (now - this.lastTime) / 1000;
    const dt = Math.min(Math.max(rawDt, 0), DT_CLAMP_SECONDS) * this.speed;
    this.lastTime = now;
    this.elapsed += dt;
    this.frame += 1;

    const frameState: FrameState = { dt, elapsed: this.elapsed, frame: this.frame, now };
    for (const task of this.tasks) {
      task(frameState);
    }

    this.rafId = this.raf(this.tick);
  };

  private handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      if (this.rafId !== null) {
        this.caf(this.rafId);
        this.rafId = null;
      }
    } else if (this._isRunning && this.rafId === null) {
      // Reset lastTime instead of zeroing dt, to avoid a giant dt spike on resume.
      this.lastTime = this.now();
      this.rafId = this.raf(this.tick);
    }
  }
}
