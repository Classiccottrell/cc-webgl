import * as THREE from 'three';

/** A coarse screen-space flow for matter to ride: a grid of directions across the
 * viewport, sampled by the matter vertex program (`uFlow`). Fill it each frame from
 * whatever the current is (a field another renderer on the page publishes, say), then
 * raise `uFlowGain` above 0.
 *
 * Directions are stored 8-bit, which is plenty for a direction and filters linearly
 * everywhere. */
export class MatterFlow {
  readonly texture: THREE.DataTexture;
  private readonly data: Uint8Array;
  private readonly out: [number, number] = [0, 0];

  constructor(readonly cols = 24, readonly rows = 16) {
    this.data = new Uint8Array(cols * rows * 4).fill(128);
    this.texture = new THREE.DataTexture(this.data, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  /** Samples `fn` at every cell centre. `u`, `v` run 0..1 across the viewport, `v`
   * upward; `fn` writes a direction into `out` (x right, y up, length 0..1, in units
   * where the viewport is as tall as it is wide: the shader corrects for aspect).
   * Non-finite values are stored as still water. */
  fill(fn: (u: number, v: number, out: [number, number]) => void): void {
    const { cols, rows, data, out } = this;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        out[0] = 0; out[1] = 0;
        fn((i + 0.5) / cols, (j + 0.5) / rows, out);
        const o = (j * cols + i) * 4;
        data[o] = encode(out[0]);
        data[o + 1] = encode(out[1]);
      }
    }
    this.texture.needsUpdate = true;
  }

  /** The stored direction at a cell, decoded (for tests and debugging). */
  at(i: number, j: number): [number, number] {
    const o = (j * this.cols + i) * 4;
    return [(this.data[o]! - 128) / 127, (this.data[o + 1]! - 128) / 127];
  }

  clear(): void {
    this.data.fill(128);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** -1..1 to 1..255, with 128 exactly zero so still water stays still. */
function encode(v: number): number {
  if (!Number.isFinite(v)) return 128;
  return Math.round(128 + Math.max(-1, Math.min(1, v)) * 127);
}
