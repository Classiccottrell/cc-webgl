import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  sampleMatter, seededRandom, DEFAULT_FRAGMENTS, createMatterUniforms, createMatterMaterial,
  createMatterLiquidMaterials, matterFormWeights, matterQuality, FluidPass, MATTER_VERTEX, MatterCursor,
} from '../src/matter/index.js';
import { QualityManager } from '../src/core/QualityManager.js';

const sphere = () => new THREE.SphereGeometry(1, 48, 32);
const attr = (g: THREE.BufferGeometry, name: string) => g.getAttribute(name).array as Float32Array;

describe('sampleMatter', () => {
  it('is deterministic for a geometry and seed, and differs across seeds', () => {
    const a = sampleMatter(sphere(), 2000, { seed: 7 });
    const b = sampleMatter(sphere(), 2000, { seed: 7 });
    const c = sampleMatter(sphere(), 2000, { seed: 8 });
    for (const name of ['position', 'aNormal', 'aSeed', 'aChunkC', 'aChunkR']) {
      expect(Array.from(attr(a, name))).toEqual(Array.from(attr(b, name)));
    }
    expect(Array.from(attr(a, 'position'))).not.toEqual(Array.from(attr(c, 'position')));
  });

  it('produces the requested count with finite values in every attribute', () => {
    const g = sampleMatter(sphere(), 3000, { seed: 1 });
    expect(g.getAttribute('position').count).toBe(3000);
    for (const name of ['position', 'aNormal', 'aSeed', 'aChunkC', 'aChunkR']) {
      expect(attr(g, name).every(Number.isFinite)).toBe(true);
    }
  });

  it('keeps every particle on or inside a unit sphere, with about a third inside', () => {
    const pos = attr(sampleMatter(sphere(), 4000, { seed: 2 }), 'position');
    let inside = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const r = Math.hypot(pos[i]!, pos[i + 1]!, pos[i + 2]!);
      expect(r).toBeLessThan(1.001);
      if (r < 0.98) inside++;
    }
    // volumeShare 0.33, but some pushed-in points land within 2% of the surface.
    expect(inside / 4000).toBeGreaterThan(0.2);
    expect(inside / 4000).toBeLessThan(0.36);
  });

  it('breaks the form into mixed-size fragments plus loose specks', () => {
    const g = sampleMatter(sphere(), 6000, { seed: 3 });
    const r = attr(g, 'aChunkR');
    const c = attr(g, 'aChunkC');
    let specks = 0;
    const sizes = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      if (r[i * 4 + 3] === 1) { specks++; continue; }
      const key = `${c[i * 3]},${c[i * 3 + 1]},${c[i * 3 + 2]}`;
      sizes.set(key, (sizes.get(key) ?? 0) + 1);
      expect(r[i * 4 + 3]).toBeGreaterThan(0);
      expect(r[i * 4 + 3]).toBeLessThanOrEqual(0.95);
    }
    expect(specks / 6000).toBeGreaterThan(0.09);
    expect(specks / 6000).toBeLessThan(0.15);
    const seedCount = DEFAULT_FRAGMENTS.reduce((n, t) => n + t.count, 0);
    expect(sizes.size).toBeLessThanOrEqual(seedCount);
    const counts = [...sizes.values()].sort((x, y) => y - x);
    // Mixed sizes: the biggest fragment is many times the median one.
    expect(counts[0]! / counts[Math.floor(counts.length / 2)]!).toBeGreaterThan(4);
  });

  it('bounds the geometry generously so dispersed matter is not culled', () => {
    const g = sampleMatter(sphere(), 500, { seed: 4 });
    expect(g.boundingSphere!.radius).toBeGreaterThanOrEqual(6);
  });
});

describe('seededRandom', () => {
  it('returns values in [0, 1) and repeats for the same seed', () => {
    const a = seededRandom(42), b = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('matter materials', () => {
  it('share one uniforms object across sprite, depth and thickness passes', () => {
    const u = createMatterUniforms();
    const sprite = createMatterMaterial(u);
    const liquid = createMatterLiquidMaterials(u);
    expect(sprite.uniforms.uDisperse).toBe(u.uDisperse);
    expect(liquid.depth.uniforms.uDisperse).toBe(u.uDisperse);
    expect(liquid.thickness.uniforms.uTime).toBe(u.uTime);
    expect(liquid.depth.defines).toHaveProperty('DEPTH_PASS');
    expect(sprite.defines).not.toHaveProperty('DEPTH_PASS');
  });

  it('declares every uniform the vertex program reads', () => {
    const u = createMatterUniforms();
    const declared = [...MATTER_VERTEX.matchAll(/uniform\s+\w+\s+([^;]+);/g)]
      .flatMap((m) => m[1]!.split(',').map((s) => s.trim().replace(/\[.*\]$/, '')))
      .filter((n) => !['uRadius', 'uDepthScale'].includes(n));
    for (const name of declared) expect(u, name).toHaveProperty(name);
  });

  it('defaults the cursor to Push with a 0.22 reach', () => {
    const u = createMatterUniforms();
    expect(u.uMode.value).toBe(MatterCursor.push);
    expect(u.uReachK.value).toBeCloseTo(1 / 0.22 ** 2);
  });
});

describe('matterFormWeights', () => {
  it('splits Solid, Liquid and Gas and crossfades between neighbours', () => {
    expect(matterFormWeights(0)).toEqual({ solid: 1, liquid: 0, gas: 0 });
    expect(matterFormWeights(1)).toEqual({ solid: 0, liquid: 1, gas: 0 });
    expect(matterFormWeights(2)).toEqual({ solid: 0, liquid: 0, gas: 1 });
    const mid = matterFormWeights(1.5);
    expect(mid.liquid).toBeCloseTo(0.5);
    expect(mid.gas).toBeCloseTo(0.5);
  });
});

describe('matterQuality', () => {
  it('follows the QualityManager tier', () => {
    const qm = new QualityManager({ capabilityProbe: () => true });
    expect(matterQuality(qm.profile)).toMatchObject({ particleScale: 1, fluid: true, fluidResolution: 1 });
    qm.forceTier('REDUCED');
    expect(matterQuality(qm.profile)).toMatchObject({ particleScale: 0.5, fluid: true, fluidResolution: 0.5 });
    qm.forceTier('FALLBACK');
    expect(matterQuality(qm.profile)).toMatchObject({ particleScale: 0, fluid: false });
  });
});

describe('FluidPass', () => {
  it('sizes its targets from resolution and keeps depth scale in step with the camera', () => {
    const camera = new THREE.PerspectiveCamera(35, 2, 0.1, 100);
    const pass = new FluidPass(camera, createMatterUniforms());
    pass.setSize(1000, 500);
    const full = pass.liquidUniforms.uDepthScale.value;
    expect(full).toBeCloseTo(500 / (2 * Math.tan(THREE.MathUtils.degToRad(17.5))));
    pass.setQuality({ resolution: 0.5 });
    expect(pass.liquidUniforms.uDepthScale.value).toBeCloseTo(full / 2);
    pass.dispose();
  });

  it('disposes every target and material it owns, but not the shared particle geometry', () => {
    const pass = new FluidPass(new THREE.PerspectiveCamera(), createMatterUniforms());
    const geometry = sampleMatter(sphere(), 200, { seed: 5 });
    pass.setGeometry(geometry);
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeTarget = vi.spyOn(THREE.WebGLRenderTarget.prototype, 'dispose');
    const disposeMaterial = vi.spyOn(THREE.ShaderMaterial.prototype, 'dispose');
    pass.dispose();
    expect(disposeTarget).toHaveBeenCalledTimes(4);
    expect(disposeMaterial).toHaveBeenCalledTimes(4); // depth, thickness, blur, composite
    expect(disposeGeometry).not.toHaveBeenCalled();
    disposeTarget.mockRestore();
    disposeMaterial.mockRestore();
  });
});
