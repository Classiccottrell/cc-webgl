import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ResourceRegistry } from '../src/resources/ResourceRegistry.js';

describe('ResourceRegistry', () => {
  it('disposes tracked GPU resources on disposeAll', () => {
    const registry = new ResourceRegistry();
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const disposeGeo = vi.spyOn(geometry, 'dispose');
    const disposeMat = vi.spyOn(material, 'dispose');

    registry.track(geometry);
    registry.track(material);
    registry.disposeAll();

    expect(disposeGeo).toHaveBeenCalledOnce();
    expect(disposeMat).toHaveBeenCalledOnce();
  });

  it('runs CPU escape-hatch disposer functions', () => {
    const registry = new ResourceRegistry();
    const disposer = vi.fn();
    registry.track(disposer);
    registry.disposeAll();
    expect(disposer).toHaveBeenCalledOnce();
  });

  it('traverses Object3D and disposes geometry+material+textures', () => {
    const registry = new ResourceRegistry();
    const texture = new THREE.Texture();
    const disposeTex = vi.spyOn(texture, 'dispose');
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const disposeMat = vi.spyOn(material, 'dispose');
    const geometry = new THREE.BoxGeometry();
    const disposeGeo = vi.spyOn(geometry, 'dispose');
    const mesh = new THREE.Mesh(geometry, material);
    const group = new THREE.Group();
    group.add(mesh);

    registry.track(group);
    registry.disposeAll();

    expect(disposeGeo).toHaveBeenCalledOnce();
    expect(disposeMat).toHaveBeenCalledOnce();
    expect(disposeTex).toHaveBeenCalledOnce();
  });

  it('untrack removes a resource without disposing it', () => {
    const registry = new ResourceRegistry();
    const geometry = new THREE.BufferGeometry();
    const disposeGeo = vi.spyOn(geometry, 'dispose');
    registry.track(geometry);
    registry.untrack(geometry);
    registry.disposeAll();
    expect(disposeGeo).not.toHaveBeenCalled();
  });

  it('untrack removes a closure disposer without running it', () => {
    const registry = new ResourceRegistry();
    const disposer = vi.fn();
    registry.track(disposer);
    registry.untrack(disposer);
    registry.disposeAll();
    expect(disposer).not.toHaveBeenCalled();
  });

  it('disposeAndUntrack disposes an object resource immediately and stops tracking it', () => {
    const registry = new ResourceRegistry();
    const geometry = new THREE.BufferGeometry();
    const disposeGeo = vi.spyOn(geometry, 'dispose');
    registry.track(geometry);
    registry.disposeAndUntrack(geometry);
    expect(disposeGeo).toHaveBeenCalledOnce();
    registry.disposeAll();
    expect(disposeGeo).toHaveBeenCalledOnce(); // not disposed twice
  });

  it('disposeAndUntrack runs a closure disposer immediately and stops tracking it', () => {
    const registry = new ResourceRegistry();
    const disposer = vi.fn();
    registry.track(disposer);
    registry.disposeAndUntrack(disposer);
    expect(disposer).toHaveBeenCalledOnce();
    registry.disposeAll();
    expect(disposer).toHaveBeenCalledOnce();
  });

  it('report() summarizes tracked resource counts by kind', () => {
    const registry = new ResourceRegistry();
    registry.track(new THREE.BufferGeometry());
    registry.track(new THREE.BufferGeometry());
    registry.track(new THREE.MeshBasicMaterial());
    const report = registry.report();
    expect(report).toEqual(
      expect.arrayContaining([
        { kind: 'geometry', count: 2 },
        { kind: 'material', count: 1 },
      ])
    );
  });
});
