import type { ViewportState, QualityTier } from '../types.js';

export interface CCWebGLEventMap {
  resize: ViewportState;
  'quality-change': { previous: QualityTier; next: QualityTier };
  'reduced-motion-change': { matches: boolean };
  'context-lost': { canvas: HTMLCanvasElement };
  'context-restored': { canvas: HTMLCanvasElement };
  'asset-progress': { url: string; loaded: number; total: number };
  'asset-error': { url: string; error: unknown };
  error: { source: string; error: unknown };
}

type Listener<T> = (payload: T) => void;

/** Typed pub/sub. No untyped emit path exposed publicly. */
export class EventBus<EventMap extends Record<string, any>> {
  private listeners = new Map<keyof EventMap, Set<Listener<any>>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of Array.from(set)) {
      listener(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
