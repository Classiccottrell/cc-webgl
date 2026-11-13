import type * as THREE from 'three';

/** What a full-screen pass needs to turn a pixel and a linear view depth back into a
 * view-space position, read from the camera's actual projection matrix:
 * `xy` scales, `zw` the lens centre in NDC.
 *
 *   view = vec3((ndc + zw) * xy, -1) * depth
 *
 * `(uv * 2 - 1) * tan(fov / 2)` is the special case of a centred, unzoomed lens. It
 * goes wrong the moment the camera has a view offset (an object framed clear of a UI
 * panel) or a zoom: every position is sheared by an amount that grows with depth, which
 * tilts the normals taken from depth differences and skews the shading. */
export function viewUnprojection(projection: THREE.Matrix4, out: THREE.Vector4): THREE.Vector4 {
  const e = projection.elements;
  return out.set(1 / e[0]!, 1 / e[5]!, e[8]!, e[9]!);
}

/** Pixels one world unit spans at view distance 1, for a target `heightPx` tall. Use it
 * for `gl_PointSize = size * pixelsPerUnit / -mv.z`. Unlike `height / (2 tan(fov / 2))`
 * it follows the camera's zoom and view offset. */
export function pixelsPerUnit(projection: THREE.Matrix4, heightPx: number): number {
  return (projection.elements[5]! * heightPx) / 2;
}
