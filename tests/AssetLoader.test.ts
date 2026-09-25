import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { AssetLoader } from '../src/resources/AssetLoader.js';

function fakeTexture(width: number, height: number): THREE.Texture {
  const tex = new THREE.Texture();
  (tex as any).image = { width, height };
  return tex;
}

describe('AssetLoader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces the memory budget once tracked bytes meet the ceiling', async () => {
    // 512x512x4 = 1MB per texture; budget of 1MB allows the first load, blocks the second.
    const loader = new AssetLoader(1024 * 1024);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (
      this: THREE.TextureLoader,
      _url: string,
      onLoad?: (tex: THREE.Texture) => void
    ) {
      onLoad?.(fakeTexture(512, 512));
      return fakeTexture(512, 512);
    } as any);

    await expect(loader.loadTexture('a.png')).resolves.toBeInstanceOf(THREE.Texture);
    await expect(loader.loadTexture('b.png')).rejects.toThrow(/memory budget exceeded/);
  });

  it('clearCache disposes GPU resources tracked from loaded textures', async () => {
    const loader = new AssetLoader();
    const tex = fakeTexture(64, 64);
    const disposeTex = vi.spyOn(tex, 'dispose');
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (
      this: THREE.TextureLoader,
      _url: string,
      onLoad?: (tex: THREE.Texture) => void
    ) {
      onLoad?.(tex);
      return tex;
    } as any);

    await loader.loadTexture('a.png');
    loader.clearCache();

    expect(disposeTex).toHaveBeenCalledOnce();
  });

  it('clearCache resets the tracked byte estimate, re-allowing loads under budget', async () => {
    const loader = new AssetLoader(1024 * 1024);
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (
      this: THREE.TextureLoader,
      _url: string,
      onLoad?: (tex: THREE.Texture) => void
    ) {
      onLoad?.(fakeTexture(512, 512));
      return fakeTexture(512, 512);
    } as any);

    await loader.loadTexture('a.png');
    await expect(loader.loadTexture('b.png')).rejects.toThrow(/memory budget exceeded/);

    loader.clearCache();

    await expect(loader.loadTexture('c.png')).resolves.toBeInstanceOf(THREE.Texture);
  });

  it('rejects and disposes a load that is cancelled before completion', async () => {
    const loader = new AssetLoader();
    let onLoad: ((texture: THREE.Texture) => void) | undefined;
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (
      this: THREE.TextureLoader,
      _url: string,
      callback?: (texture: THREE.Texture) => void
    ) {
      onLoad = callback;
      return fakeTexture(1, 1);
    } as any);

    const promise = loader.loadTexture('cancelled.png');
    loader.cancel('cancelled.png');
    const texture = fakeTexture(8, 8);
    const disposeTexture = vi.spyOn(texture, 'dispose');
    onLoad?.(texture);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(disposeTexture).toHaveBeenCalledOnce();
  });
});
