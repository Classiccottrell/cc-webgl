import type { ScrollDriver, ScrollState } from '../types.js';

/** Native-scroll driver by default. */
export class NativeScrollDriver implements ScrollDriver {
  private target: HTMLElement | Window;
  private handler?: () => void;

  constructor(target: HTMLElement | Window = typeof window !== 'undefined' ? window : (undefined as any)) {
    this.target = target;
  }

  start(onUpdate: (raw: { y: number; timestamp: number }) => void): void {
    const read = () => {
      const y = this.target === window ? window.scrollY : (this.target as HTMLElement).scrollTop;
      onUpdate({ y, timestamp: performance.now() });
    };
    this.handler = read;
    this.target.addEventListener('scroll', read, { passive: true });
    read();
  }

  stop(): void {
    if (this.handler) this.target.removeEventListener('scroll', this.handler);
  }
}

// isScrolling debounces false this long after the last sample (ms). No hard spec value;
// chosen as a short idle window that survives one dropped scroll-event tick without
// flickering isScrolling on rapid-fire native scroll events.
const SCROLL_IDLE_MS = 150;

/** CORE and mandatory — ScrollBridge, not optional, since SceneContext.scroll is
 * non-optional (blueprint §2 discriminator rule). Native-scroll by default; a Lenis
 * (or any) driver is injectable via the ScrollDriver interface. */
export class ScrollBridge {
  private driver: ScrollDriver;
  private state: ScrollState = {
    y: 0,
    previousY: 0,
    velocity: 0,
    direction: 0,
    progress: 0,
    isScrolling: false,
    timestamp: 0,
  };
  private lastY = 0;
  private lastTimestamp = 0;
  private hasSample = false;
  private scrollLimit: () => number;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private setIdleTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;

  constructor(
    driver: ScrollDriver = new NativeScrollDriver(),
    scrollLimit?: () => number,
    // Wrapped (not a bare `= setTimeout` reference): assigning the native function to
    // `this.setIdleTimeout` and later calling it as `this.setIdleTimeout(...)` invokes
    // it with `this` as receiver instead of `window`/`globalThis`, which real browsers
    // reject with "Illegal invocation" (not caught by vitest's happy-dom environment).
    setIdleTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn, ms) => setTimeout(fn, ms)
  ) {
    this.driver = driver;
    this.scrollLimit = scrollLimit ?? defaultScrollLimit;
    this.setIdleTimeout = setIdleTimeout;
  }

  start(): void {
    this.driver.start((raw) => this.handleUpdate(raw));
  }

  stop(): void {
    this.driver.stop();
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  get scroll(): ScrollState {
    return this.state;
  }

  private handleUpdate(raw: { y: number; timestamp: number }): void {
    const dt = this.hasSample ? (raw.timestamp - this.lastTimestamp) / 1000 : 0;
    const previousY = this.hasSample ? this.lastY : raw.y;
    const deltaY = raw.y - previousY;
    const velocity = dt > 0 ? deltaY / dt : 0;
    const direction: -1 | 0 | 1 = velocity > 0 ? 1 : velocity < 0 ? -1 : 0;
    const limit = this.scrollLimit();
    const progress = limit > 0 ? clamp(raw.y / limit, 0, 1) : 0;

    this.state = {
      y: raw.y,
      previousY,
      velocity,
      direction,
      progress,
      isScrolling: true,
      timestamp: raw.timestamp,
    };
    this.lastY = raw.y;
    this.lastTimestamp = raw.timestamp;
    this.hasSample = true;

    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = this.setIdleTimeout(() => {
      this.idleTimer = null;
      this.state = { ...this.state, isScrolling: false, velocity: 0, direction: 0 };
    }, SCROLL_IDLE_MS);
  }
}

function defaultScrollLimit(): number {
  if (typeof document === 'undefined') return 0;
  return Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
