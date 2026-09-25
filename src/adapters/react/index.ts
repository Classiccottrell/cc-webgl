// React-only barrel — separate export subpath (cc-webgl/react), tree-shakeable, kept
// out of ./index.ts so non-React consumers never pull in React.
export { useScene } from './useScene.js';
export { useScrollState } from './useScrollState.js';
export { useQualityProfile } from './useQualityProfile.js';
export { useReducedMotion } from './useReducedMotion.js';
export { SceneErrorBoundary } from './SceneErrorBoundary.js';
