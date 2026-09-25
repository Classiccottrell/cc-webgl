import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { ResourceRegistry } from './ResourceRegistry.js';

export interface LoadOptions {
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
  priority?: 'high' | 'low';
}

export interface AssetLoaderApi {
  loadGLTF(url: string, opts?: LoadOptions): Promise<GLTF>;
  loadEnvironment(source: THREE.Scene | string, opts?: LoadOptions): Promise<{ texture: THREE.Texture; dispose(): void }>;
  loadTexture(url: string, opts?: LoadOptions): Promise<THREE.Texture>;
  loadFont(url: string, opts?: LoadOptions): Promise<Font>;
  cancel(url: string): void;
  clearCache(): void;
  readonly memoryBudgetBytes: number;
}

const DEFAULT_MEMORY_BUDGET_BYTES = 256 * 1024 * 1024; // 256MB safety ceiling

/** GLTF/GLB, HDR env, texture, font loading: cache, cancel, progress, memory cap.
 * Caller is responsible for resources.track()-ing returned GPU objects. */
export class AssetLoader implements AssetLoaderApi {
  readonly memoryBudgetBytes: number;
  private cache = new Map<string, Promise<unknown>>();
  private cancelled = new Set<string>();
  private gltfLoader = new GLTFLoader();
  private textureLoader = new THREE.TextureLoader();
  private fontLoader = new FontLoader();
  private estimatedBytes = 0;
  /** Owns GPU disposal for cached assets; clearCache() drains this instead of
   * just dropping cache entries (which used to leak GPU memory). */
  private cacheRegistry = new ResourceRegistry();
  private byteCost = new Map<string, number>();
  private cacheDisposers = new Map<string, () => void>();

  constructor(memoryBudgetBytes = DEFAULT_MEMORY_BUDGET_BYTES) {
    this.memoryBudgetBytes = memoryBudgetBytes;
  }

  loadGLTF(url: string, opts?: LoadOptions): Promise<GLTF> {
    return this.dedupe(url, () => this.runGLTF(url, opts));
  }

  loadEnvironment(
    source: THREE.Scene | string,
    _opts?: LoadOptions
  ): Promise<{ texture: THREE.Texture; dispose(): void }> {
    // `source` string form is reserved for future HDR-file loading; scene form
    // matches Mascot3D L32-34's PMREMGenerator(RoomEnvironment) path.
    if (typeof source === 'string') {
      return Promise.reject(new Error('loadEnvironment(url) not yet implemented; pass a THREE.Scene'));
    }
    return Promise.resolve().then(() => {
      throw new Error('loadEnvironment requires a THREE.WebGLRenderer; use createEnvironment(renderer) instead');
    });
  }

  /** Renderer-bound env loader — PMREMGenerator needs a renderer, which loadEnvironment's
   * public signature (per blueprint) does not accept. Ports Mascot3D L32-34 + L173-174. */
  createEnvironment(renderer: THREE.WebGLRenderer): { texture: THREE.Texture; dispose(): void } {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    return {
      texture: envTexture,
      dispose: () => {
        envTexture.dispose();
        pmrem.dispose();
      },
    };
  }

  loadTexture(url: string, opts?: LoadOptions): Promise<THREE.Texture> {
    return this.dedupe(url, () => this.runTexture(url, opts));
  }

  loadFont(url: string, opts?: LoadOptions): Promise<Font> {
    return this.dedupe(url, () => this.runFont(url, opts));
  }

  cancel(url: string): void {
    this.cancelled.add(url);
    const disposer = this.cacheDisposers.get(url);
    if (disposer) {
      this.cacheRegistry.disposeAndUntrack(disposer);
      this.cacheDisposers.delete(url);
      this.estimatedBytes -= this.byteCost.get(url) ?? 0;
      this.byteCost.delete(url);
    }
    this.cache.delete(url);
  }

  clearCache(): void {
    for (const url of this.cache.keys()) this.cancelled.add(url);
    this.cache.clear();
    this.cacheRegistry.disposeAll();
    this.byteCost.clear();
    this.cacheDisposers.clear();
    this.estimatedBytes = 0;
  }

  private dedupe<T>(url: string, run: () => Promise<T>): Promise<T> {
    const existing = this.cache.get(url);
    if (existing) return existing as Promise<T>;
    this.cancelled.delete(url);
    const promise = run();
    this.cache.set(url, promise);
    promise.catch(() => this.cache.delete(url));
    return promise;
  }

  /** Returns a rejected Promise (never throws) once the running total meets the
   * budget — guardBudget() is called from inside dedupe()'s run() closure, so a
   * thrown error here would surface as a sync throw instead of the Promise
   * rejection the public API signatures promise. */
  private guardBudget(url: string): Promise<void> | undefined {
    if (this.estimatedBytes >= this.memoryBudgetBytes) {
      return Promise.reject(new Error(`AssetLoader: memory budget exceeded loading ${url}`));
    }
    return undefined;
  }

  private recordBytes(url: string, bytes: number, disposable?: { dispose(): void } | (() => void)): void {
    this.byteCost.set(url, bytes);
    this.estimatedBytes += bytes;
    if (disposable) {
      const disposer = typeof disposable === 'function' ? disposable : () => disposable.dispose();
      this.cacheDisposers.set(url, disposer);
      this.cacheRegistry.track(disposer);
    }
  }

  private estimateTextureBytes(tex: THREE.Texture): number {
    const image = tex.image as { width?: number; height?: number } | undefined;
    const w = image?.width ?? 0;
    const h = image?.height ?? 0;
    return w * h * 4;
  }

  private estimateGLTFBytes(gltf: GLTF): number {
    let bytes = 0;
    gltf.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
      if (!geometry) return;
      for (const key of Object.keys(geometry.attributes)) {
        bytes += geometry.attributes[key].array.byteLength;
      }
      if (geometry.index) bytes += geometry.index.array.byteLength;
    });
    return bytes;
  }

  private runGLTF(url: string, opts?: LoadOptions): Promise<GLTF> {
    const budgetError = this.guardBudget(url);
    if (budgetError) return budgetError as Promise<never>;
    return new Promise<GLTF>((resolve, reject) => {
      if (opts?.signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      this.gltfLoader.load(
        url,
        (gltf) => resolve(gltf),
        (evt) => opts?.onProgress?.(evt.loaded, evt.total),
        (err) => reject(err)
      );
    }).then((gltf) => {
      if (this.cancelled.has(url)) {
        this.disposeGLTF(gltf);
        throw new DOMException('Aborted', 'AbortError');
      }
      this.recordBytes(url, this.estimateGLTFBytes(gltf), () => {
        this.disposeGLTF(gltf);
      });
      return gltf;
    });
  }

  private runTexture(url: string, opts?: LoadOptions): Promise<THREE.Texture> {
    const budgetError = this.guardBudget(url);
    if (budgetError) return budgetError as Promise<never>;
    return new Promise<THREE.Texture>((resolve, reject) => {
      if (opts?.signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      this.textureLoader.load(
        url,
        (tex) => resolve(tex),
        (evt) => opts?.onProgress?.(evt.loaded, evt.total),
        (err) => reject(err)
      );
    }).then((tex) => {
      if (this.cancelled.has(url)) {
        tex.dispose();
        throw new DOMException('Aborted', 'AbortError');
      }
      this.recordBytes(url, this.estimateTextureBytes(tex), tex);
      return tex;
    });
  }

  private runFont(url: string, opts?: LoadOptions): Promise<Font> {
    const budgetError = this.guardBudget(url);
    if (budgetError) return budgetError as Promise<never>;
    return new Promise<Font>((resolve, reject) => {
      if (opts?.signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      this.fontLoader.load(
        url,
        (font) => resolve(font),
        (evt) => opts?.onProgress?.(evt.loaded, evt.total),
        (err) => reject(err)
      );
    }).then((font) => {
      if (this.cancelled.has(url)) throw new DOMException('Aborted', 'AbortError');
      this.recordBytes(url, 0);
      return font;
    });
  }

  private disposeGLTF(gltf: GLTF): void {
    gltf.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    });
  }
}
