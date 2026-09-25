import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrollBridge } from '../src/input/ScrollBridge.js';
import type { ScrollDriver } from '../src/types.js';

function makeManualDriver(): { driver: ScrollDriver; push: (y: number, timestamp: number) => void } {
  let cb: ((raw: { y: number; timestamp: number }) => void) | null = null;
  return {
    driver: {
      start(onUpdate) {
        cb = onUpdate;
      },
      stop() {
        cb = null;
      },
    },
    push(y, timestamp) {
      cb?.({ y, timestamp });
    },
  };
}

describe('ScrollBridge', () => {
  it('derives velocity from y delta over time', () => {
    const { driver, push } = makeManualDriver();
    const bridge = new ScrollBridge(driver, () => 1000);
    bridge.start();
    push(0, 0);
    push(100, 1000); // 100px in 1s => 100px/s
    expect(bridge.scroll.velocity).toBeCloseTo(100, 5);
  });

  it('derives direction sign from velocity', () => {
    const { driver, push } = makeManualDriver();
    const bridge = new ScrollBridge(driver, () => 1000);
    bridge.start();
    push(0, 0);
    push(100, 1000);
    expect(bridge.scroll.direction).toBe(1);

    push(0, 2000);
    expect(bridge.scroll.direction).toBe(-1);
  });

  it('direction is 0 with no movement', () => {
    const { driver, push } = makeManualDriver();
    const bridge = new ScrollBridge(driver, () => 1000);
    bridge.start();
    push(50, 0);
    push(50, 1000);
    expect(bridge.scroll.direction).toBe(0);
  });

  it('computes progress as y / scrollLimit, clamped 0..1', () => {
    const { driver, push } = makeManualDriver();
    const bridge = new ScrollBridge(driver, () => 500);
    bridge.start();
    push(250, 0);
    expect(bridge.scroll.progress).toBeCloseTo(0.5, 5);

    push(9999, 1000);
    expect(bridge.scroll.progress).toBe(1);
  });

  it('progress is 0 when scroll limit is 0', () => {
    const { driver, push } = makeManualDriver();
    const bridge = new ScrollBridge(driver, () => 0);
    bridge.start();
    push(100, 0);
    expect(bridge.scroll.progress).toBe(0);
  });

  it('previousY equals y on the first sample, then tracks the prior y', () => {
    const { driver, push } = makeManualDriver();
    const bridge = new ScrollBridge(driver, () => 1000);
    bridge.start();
    push(50, 0);
    expect(bridge.scroll.previousY).toBe(50);
    push(120, 1000);
    expect(bridge.scroll.previousY).toBe(50);
    expect(bridge.scroll.y).toBe(120);
  });

  it('timestamp mirrors the raw sample timestamp', () => {
    const { driver, push } = makeManualDriver();
    const bridge = new ScrollBridge(driver, () => 1000);
    bridge.start();
    push(10, 1234);
    expect(bridge.scroll.timestamp).toBe(1234);
  });

  describe('isScrolling', () => {
    let idleCb: (() => void) | null;
    function manualIdleTimeout(fn: () => void, _ms: number) {
      idleCb = fn;
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }

    beforeEach(() => {
      idleCb = null;
    });

    it('is true immediately after a sample, false once the idle timeout fires', () => {
      const { driver, push } = makeManualDriver();
      const bridge = new ScrollBridge(driver, () => 1000, manualIdleTimeout);
      bridge.start();
      push(0, 0);
      expect(bridge.scroll.isScrolling).toBe(true);

      idleCb?.();
      expect(bridge.scroll.isScrolling).toBe(false);
      expect(bridge.scroll.velocity).toBe(0);
      expect(bridge.scroll.direction).toBe(0);
    });

    it('re-arms the idle timer on each new sample', () => {
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
      const { driver, push } = makeManualDriver();
      let calls = 0;
      const bridge = new ScrollBridge(driver, () => 1000, (fn) => {
        calls += 1;
        idleCb = fn;
        return calls as unknown as ReturnType<typeof setTimeout>;
      });
      bridge.start();
      push(0, 0);
      push(10, 100);
      expect(calls).toBe(2);
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });
});
