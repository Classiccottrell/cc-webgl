import * as THREE from 'three';

type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.WebGLRenderTarget;
type Tracked =
  | { kind: 'geometry'; resource: THREE.BufferGeometry }
  | { kind: 'material'; resource: THREE.Material }
  | { kind: 'texture'; resource: THREE.Texture }
  | { kind: 'renderTarget'; resource: THREE.WebGLRenderTarget }
  | { kind: 'object3d'; resource: THREE.Object3D }
  | { kind: 'disposer'; resource: () => void };

/** GPU + CPU resource tracking/disposal, dev-mode report(). Mirrors Mascot3D's teardown
 * (L151-180): the mesh traverse + material-map enumeration becomes track(Object3D)'s
 * own disposer; env texture + PMREM generator are tracked individually. */
export class ResourceRegistry {
  private entries: Tracked[] = [];
  private byResource = new WeakMap<object, Tracked>();

  track(resource: THREE.BufferGeometry): void;
  track(resource: THREE.Material): void;
  track(resource: THREE.Texture): void;
  track(resource: THREE.WebGLRenderTarget): void;
  track(resource: THREE.Object3D): void;
  track(disposer: () => void): void;
  track(resource: Disposable | THREE.Object3D | (() => void)): void {
    let entry: Tracked;
    if (typeof resource === 'function') {
      entry = { kind: 'disposer', resource };
      this.entries.push(entry);
      this.byResource.set(resource, entry);
      return;
    }
    if (resource instanceof THREE.BufferGeometry) {
      entry = { kind: 'geometry', resource };
    } else if (resource instanceof THREE.Material) {
      entry = { kind: 'material', resource };
    } else if (resource instanceof THREE.WebGLRenderTarget) {
      entry = { kind: 'renderTarget', resource };
    } else if (resource instanceof THREE.Texture) {
      entry = { kind: 'texture', resource };
    } else if (resource instanceof THREE.Object3D) {
      entry = { kind: 'object3d', resource };
    } else {
      return;
    }
    this.entries.push(entry);
    this.byResource.set(resource, entry);
  }

  /** Stops tracking `resource` WITHOUT disposing it — the caller becomes responsible
   * for its lifecycle. Accepts anything previously passed to track(), including
   * closure disposer functions. To untrack AND dispose in one call, use
   * disposeAndUntrack() instead. */
  untrack(resource: unknown): void {
    const entry = this.lookup(resource);
    if (!entry) return;
    const idx = this.entries.indexOf(entry);
    if (idx !== -1) this.entries.splice(idx, 1);
    this.byResource.delete(resource as object);
  }

  /** Stops tracking `resource` and immediately disposes it. Use this when "untrack"
   * is meant to also mean "clean up now"; use untrack() alone when ownership is
   * simply transferring elsewhere. */
  disposeAndUntrack(resource: unknown): void {
    const entry = this.lookup(resource);
    if (!entry) return;
    this.untrack(resource);
    try {
      this.disposeEntry(entry);
    } catch {
      // best-effort disposal; mirrors disposeAll()'s error handling
    }
  }

  private lookup(resource: unknown): Tracked | undefined {
    if (resource === null) return undefined;
    const t = typeof resource;
    if (t !== 'object' && t !== 'function') return undefined;
    return this.byResource.get(resource as object);
  }

  disposeAll(): void {
    for (const entry of this.entries) {
      try {
        this.disposeEntry(entry);
      } catch {
        // best-effort disposal; one bad resource must not block the rest
      }
    }
    this.entries = [];
    this.byResource = new WeakMap();
  }

  report(): { kind: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const entry of this.entries) {
      counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([kind, count]) => ({ kind, count }));
  }

  private disposeEntry(entry: Tracked): void {
    switch (entry.kind) {
      case 'disposer':
        entry.resource();
        break;
      case 'object3d':
        entry.resource.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if ((mesh as any).geometry) {
            (mesh as any).geometry.dispose?.();
          }
          const material = (mesh as any).material;
          if (material) {
            const materials = Array.isArray(material) ? material : [material];
            for (const mat of materials) {
              if (!mat) continue;
              for (const key of Object.keys(mat)) {
                const value = (mat as any)[key];
                if (value instanceof THREE.Texture) value.dispose();
              }
              mat.dispose?.();
            }
          }
        });
        break;
      default:
        entry.resource.dispose();
        break;
    }
  }
}
