import { describe, it, expect, vi } from 'vitest';
import { EventBus, type CCWebGLEventMap } from '../src/events/EventBus.js';

describe('EventBus', () => {
  it('emits typed payloads to subscribers', () => {
    const bus = new EventBus<CCWebGLEventMap>();
    const spy = vi.fn();
    bus.on('resize', spy);
    bus.emit('resize', { width: 100, height: 200, dpr: 1, aspect: 0.5 });
    expect(spy).toHaveBeenCalledWith({ width: 100, height: 200, dpr: 1, aspect: 0.5 });
  });

  it('unsubscribe via returned fn stops delivery', () => {
    const bus = new EventBus<CCWebGLEventMap>();
    const spy = vi.fn();
    const off = bus.on('resize', spy);
    off();
    bus.emit('resize', { width: 1, height: 1, dpr: 1, aspect: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('unsubscribe via off() stops delivery', () => {
    const bus = new EventBus<CCWebGLEventMap>();
    const spy = vi.fn();
    bus.on('error', spy);
    bus.off('error', spy);
    bus.emit('error', { source: 'x', error: new Error('e') });
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not throw when emitting with no subscribers', () => {
    const bus = new EventBus<CCWebGLEventMap>();
    expect(() => bus.emit('context-lost', { canvas: {} as HTMLCanvasElement })).not.toThrow();
  });

  it('clear() removes all listeners', () => {
    const bus = new EventBus<CCWebGLEventMap>();
    const spy = vi.fn();
    bus.on('resize', spy);
    bus.clear();
    bus.emit('resize', { width: 1, height: 1, dpr: 1, aspect: 1 });
    expect(spy).not.toHaveBeenCalled();
  });
});
