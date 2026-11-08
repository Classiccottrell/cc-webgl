// `cc-webgl/matter`: forms that can hold together, melt, shatter or diffuse. An optional
// subpath, like `cc-webgl/react`; the core barrel never imports it.
//
// A form is one particle set (`sampleMatter`) drawn by one vertex program for every Form:
// sprites for Solid and Gas (`createMatterMaterial`), and a screen-space liquid
// (`FluidPass`) for Liquid. Drive them through one `MatterUniforms` object, with time
// from FrameScheduler and quality from QualityManager (`matterQuality`). Nothing here
// owns a render loop.
export { MATTER_GLSL } from './glsl.js';
export {
  MatterCursor, WAKE_TRAIL_LENGTH, MATTER_VERTEX,
  createMatterUniforms, createMatterMaterial, createMatterLiquidMaterials, matterFormWeights,
} from './materials.js';
export type { MatterCursorMode, MatterUniforms, MatterLiquidUniforms } from './materials.js';
export { sampleMatter, seededRandom, DEFAULT_FRAGMENTS } from './sample.js';
export type { SampleMatterOptions, FragmentTier } from './sample.js';
export { FluidPass } from './FluidPass.js';
export type { FluidPassOptions } from './FluidPass.js';
export { matterQuality } from './quality.js';
export type { MatterQuality } from './quality.js';
