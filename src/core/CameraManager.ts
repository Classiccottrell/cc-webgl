import * as THREE from 'three';
import type { ViewportState } from '../types.js';

/** Update a SceneContext.camera (perspective or orthographic union) for a new viewport.
 * Orthographic cameras have no `aspect`; frustum edges are rebuilt from a fixed
 * vertical extent (derived from the current top/bottom span) times the new aspect. */
export function updateCameraViewport(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  viewport: ViewportState
): void {
  if ('isPerspectiveCamera' in camera && camera.isPerspectiveCamera) {
    camera.aspect = viewport.aspect;
    camera.updateProjectionMatrix();
    return;
  }
  const ortho = camera as THREE.OrthographicCamera;
  const verticalExtent = ortho.top - ortho.bottom;
  const halfHeight = verticalExtent / 2;
  const halfWidth = halfHeight * viewport.aspect;
  ortho.left = -halfWidth;
  ortho.right = halfWidth;
  ortho.top = halfHeight;
  ortho.bottom = -halfHeight;
  ortho.updateProjectionMatrix();
}

export interface FrameObjectOptions {
  azimuth?: number; // radians
  elevation?: number; // radians
  fill?: number; // 0..1, fraction of frustum filled by bounding sphere (default 0.97, Mascot3D L84)
}

/** Camera ctor, viewport-aware projection updates, presets (frameObject), pointer/orbit
 * interaction. Ports Mascot3D L77-93's box->sphere->fov->distance->spherical-placement
 * math as a named preset. */
export class CameraManager {
  // Constructed as perspective by default (Mascot3D port); SceneContext.camera's public
  // type is the perspective|orthographic union per spec, so updateViewport/frameObject
  // guard on isPerspectiveCamera for forward-compat with an orthographic camera swapped
  // in via a future constructor overload.
  readonly camera: THREE.PerspectiveCamera;

  constructor(fov = 35, near = 0.1, far = 100) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  }

  updateViewport(viewport: ViewportState): void {
    updateCameraViewport(this.camera, viewport);
  }

  /** Frame an object so its bounding sphere fills the viewport, placed at the given
   * azimuth/elevation, looking at the origin. Mirrors Mascot3D L77-93 exactly.
   * Perspective-only (uses fov to derive framing distance). */
  frameObject(object: THREE.Object3D, opts?: FrameObjectOptions): void {
    const azimuth = opts?.azimuth ?? (38 * Math.PI) / 180;
    const elevation = opts?.elevation ?? (15 * Math.PI) / 180;
    const fill = opts?.fill ?? 0.97;

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.001);
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const distance = radius / Math.sin(fovRad / 2) / fill;

    this.camera.position.set(
      distance * Math.sin(azimuth) * Math.cos(elevation),
      distance * Math.sin(elevation),
      distance * Math.cos(azimuth) * Math.cos(elevation)
    );
    this.camera.lookAt(0, 0, 0);
  }
}
