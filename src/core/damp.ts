/** Frame-rate-independent exponential damping, replacing Mascot3D L137-138's
 * 60fps-bound `v += (target - v) * 0.08` lerp. `k` is a rate constant (not the old
 * 0.08 literal — do not port that constant, it assumes a fixed 60fps tick). */
export function damp(current: number, target: number, k: number, dt: number): number {
  const t = 1 - Math.exp(-k * dt);
  return current + (target - current) * t;
}
