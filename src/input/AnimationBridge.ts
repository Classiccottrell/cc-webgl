/** Optional GSAP timeline sync; lazy-imported; no competing render loop.
 * OPTIONAL — GSAP appears nowhere in the runtime contracts. Activated only if a
 * consumer calls bridge.attach(timeline). */
export interface GSAPTimelineLike {
  progress(): number;
  duration(): number;
}

export class AnimationBridge {
  private timeline: GSAPTimelineLike | null = null;

  attach(timeline: GSAPTimelineLike): void {
    this.timeline = timeline;
  }

  detach(): void {
    this.timeline = null;
  }

  get progress(): number {
    return this.timeline ? this.timeline.progress() : 0;
  }

  get duration(): number {
    return this.timeline ? this.timeline.duration() : 0;
  }

  /** Called from FrameScheduler's animation phase, before scene.update(). No-op if no
   * timeline attached — GSAP owns its own ticker; this only reads state, never
   * schedules a competing rAF. */
  tick(): void {
    // Intentionally read-only: this bridge reports timeline state to consumers via
    // the attached timeline reference itself (gsap tickers already run via gsap.ticker,
    // not via this class) — kept as an explicit phase slot per blueprint §5's fixed
    // per-tick order, not because it owns animation timing.
    void this.timeline;
  }
}
