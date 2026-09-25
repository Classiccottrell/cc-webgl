import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrameScheduler } from '../src/core/FrameScheduler.js';

// Fake rAF: manually stepped via `flush()`, no real timers.
function makeFakeRaf() {
  let queue: FrameRequestCallback[] = [];
  return {
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    },
    cancelAnimationFrame: (_id: number) => {
      queue = [];
    },
    flush(now: number) {
      const toRun = queue;
      queue = [];
      for (const cb of toRun) cb(now);
    },
  };
}

describe('FrameScheduler', () => {
  let originalHidden: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
  });

  afterEach(() => {
    if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
  });

  it('clamps dt to 0.1s max', () => {
    let now = 0;
    const fake = makeFakeRaf();
    const scheduler = new FrameScheduler({
      requestAnimationFrame: fake.requestAnimationFrame,
      cancelAnimationFrame: fake.cancelAnimationFrame,
      now: () => now,
    });
    const seen: number[] = [];
    scheduler.addTask((frame) => seen.push(frame.dt));
    scheduler.start();

    now = 5000; // huge jump
    fake.flush(now);

    expect(seen[0]).toBeLessThanOrEqual(0.1);
  });

  it('runs tasks in the order they were added', () => {
    let now = 0;
    const fake = makeFakeRaf();
    const scheduler = new FrameScheduler({
      requestAnimationFrame: fake.requestAnimationFrame,
      cancelAnimationFrame: fake.cancelAnimationFrame,
      now: () => now,
    });
    const order: number[] = [];
    scheduler.addTask(() => order.push(1));
    scheduler.addTask(() => order.push(2));
    scheduler.addTask(() => order.push(3));
    scheduler.start();
    now = 16;
    fake.flush(now);
    expect(order).toEqual([1, 2, 3]);
  });

  it('increments frame count monotonically', () => {
    let now = 0;
    const fake = makeFakeRaf();
    const scheduler = new FrameScheduler({
      requestAnimationFrame: fake.requestAnimationFrame,
      cancelAnimationFrame: fake.cancelAnimationFrame,
      now: () => now,
    });
    const frames: number[] = [];
    scheduler.addTask((f) => frames.push(f.frame));
    scheduler.start();
    now = 16;
    fake.flush(now);
    now = 32;
    fake.flush(now);
    expect(frames).toEqual([1, 2]);
  });

  it('pauses ticking while document.hidden is true', () => {
    let now = 0;
    const fake = makeFakeRaf();
    const scheduler = new FrameScheduler({
      requestAnimationFrame: fake.requestAnimationFrame,
      cancelAnimationFrame: fake.cancelAnimationFrame,
      now: () => now,
    });
    let count = 0;
    scheduler.addTask(() => count++);
    scheduler.start();
    now = 16;
    fake.flush(now);
    expect(count).toBe(1);

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));

    // No frame queued while hidden — flushing an empty queue is a no-op.
    fake.flush(now + 100);
    expect(count).toBe(1);

    scheduler.stop();
  });

  it('stop() halts further ticks', () => {
    let now = 0;
    const fake = makeFakeRaf();
    const scheduler = new FrameScheduler({
      requestAnimationFrame: fake.requestAnimationFrame,
      cancelAnimationFrame: fake.cancelAnimationFrame,
      now: () => now,
    });
    let count = 0;
    scheduler.addTask(() => count++);
    scheduler.start();
    now = 16;
    fake.flush(now);
    scheduler.stop();
    fake.flush(now + 16);
    expect(count).toBe(1);
    expect(scheduler.isRunning).toBe(false);
  });
});
