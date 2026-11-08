import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

/** One tier of fragments: how many seeds, how much room each claims (a power-diagram
 * weight, in squared world units) and how far its pieces travel (0..1). */
export interface FragmentTier {
  count: number;
  weight: number;
  travel: number;
}

export interface SampleMatterOptions {
  /** Same geometry + seed always yields the same particles. */
  seed?: number;
  /** Share of particles pushed inside the form, so a broken form has body (default 0.33). */
  volumeShare?: number;
  /** How far inside those particles may sit, along the inverted normal (default 0.85).
   * Use a thin value (about the tube radius) for tubes and knots. */
  volumeDepth?: number;
  /** Share of particles that break off alone as loose specks (default 0.12). */
  speckShare?: number;
  /** Fragment tiers, large to small. Defaults give a few slabs, more pieces, many chips. */
  fragments?: FragmentTier[];
}

export const DEFAULT_FRAGMENTS: FragmentTier[] = [
  { count: 5, weight: 0.26, travel: 0.12 },
  { count: 16, weight: 0.08, travel: 0.42 },
  { count: 60, weight: 0.018, travel: 0.75 },
];

/** Small fast seeded PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Samples `count` particles over and through `geometry` and assigns each to a fragment,
 * returning a BufferGeometry with the attributes the matter materials read:
 * `position`, `aNormal`, `aSeed`, `aChunkC` (fragment centre) and `aChunkR` (spin axis xyz,
 * travel w).
 *
 * Fragments come from a weighted seed scatter (a power diagram): a few heavy seeds claim
 * large slabs, light ones small chips. Each point is warped by smooth noise before the
 * lookup, which rags the cell edges, so pieces read as broken rather than cut. */
export function sampleMatter(geometry: THREE.BufferGeometry, count: number, opts: SampleMatterOptions = {}): THREE.BufferGeometry {
  const rand = seededRandom(opts.seed ?? 1);
  const volumeShare = opts.volumeShare ?? 0.33;
  const volumeDepth = opts.volumeDepth ?? 0.85;
  const speckShare = opts.speckShare ?? 0.12;
  const tiers = opts.fragments ?? DEFAULT_FRAGMENTS;

  // setRandomGenerator exists in three's MeshSurfaceSampler but is missing from @types/three.
  const sampler = (new MeshSurfaceSampler(new THREE.Mesh(geometry)) as MeshSurfaceSampler & {
    setRandomGenerator(fn: () => number): MeshSurfaceSampler;
  }).setRandomGenerator(rand).build();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  // Fragment seeds sit on or a little inside the surface.
  const seeds: number[][] = [];
  const seedDepth = Math.min(0.5, volumeDepth * 0.6);
  for (const tier of tiers) {
    for (let k = 0; k < tier.count; k++) {
      sampler.sample(p, n);
      p.addScaledVector(n, -rand() * seedDepth);
      seeds.push([p.x, p.y, p.z, tier.weight, rand() - 0.5, rand() - 0.5, rand() - 0.5, Math.min(0.95, tier.travel + rand() * 0.2)]);
    }
  }
  const warp = (x: number, y: number, z: number, o: number) => 0.13 * Math.sin(3.1 * x + 1.7 * z + o) * Math.cos(2.7 * y - 1.3 * x + o * 0.5);

  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const chunkC = new Float32Array(count * 3);
  const chunkR = new Float32Array(count * 4);
  let radius = 0;

  for (let i = 0; i < count; i++) {
    sampler.sample(p, n);
    if (rand() < volumeShare) p.addScaledVector(n, -rand() * volumeDepth * rand());
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    nor[i * 3] = n.x; nor[i * 3 + 1] = n.y; nor[i * 3 + 2] = n.z;
    seed[i] = rand();
    radius = Math.max(radius, p.length());

    if (rand() < speckShare) { // a loose speck: its own piece, travels furthest
      chunkC[i * 3] = p.x; chunkC[i * 3 + 1] = p.y; chunkC[i * 3 + 2] = p.z;
      chunkR[i * 4] = rand() - 0.5; chunkR[i * 4 + 1] = rand() - 0.5; chunkR[i * 4 + 2] = rand() - 0.5; chunkR[i * 4 + 3] = 1;
      continue;
    }
    const wx = p.x + warp(p.x, p.y, p.z, 0), wy = p.y + warp(p.y, p.z, p.x, 2.1), wz = p.z + warp(p.z, p.x, p.y, 4.3);
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < seeds.length; k++) {
      const sd = seeds[k]!;
      const dx = wx - sd[0]!, dy = wy - sd[1]!, dz = wz - sd[2]!;
      const dd = dx * dx + dy * dy + dz * dz - sd[3]!;
      if (dd < bestD) { bestD = dd; best = k; }
    }
    const sd = seeds[best]!;
    chunkC[i * 3] = sd[0]!; chunkC[i * 3 + 1] = sd[1]!; chunkC[i * 3 + 2] = sd[2]!;
    chunkR[i * 4] = sd[4]!; chunkR[i * 4 + 1] = sd[5]!; chunkR[i * 4 + 2] = sd[6]!; chunkR[i * 4 + 3] = sd[7]!;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aNormal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aChunkC', new THREE.BufferAttribute(chunkC, 3));
  g.setAttribute('aChunkR', new THREE.BufferAttribute(chunkR, 4));
  // Dispersed matter travels well beyond the form; a generous bound stops it being culled.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.max(6, radius * 4));
  return g;
}
