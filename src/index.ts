// Public barrel: core + input + resources + events + errors. NOT adapters/react —
// see ./adapters/react/index.ts (separate export subpath, tree-shakeable).
export * from './types.js';

export { SceneManager } from './core/SceneManager.js';
export { RendererManager } from './core/RendererManager.js';
export { CameraManager } from './core/CameraManager.js';
export { FrameScheduler } from './core/FrameScheduler.js';
export type { FrameTask } from './core/FrameScheduler.js';
export { QualityManager } from './core/QualityManager.js';
export type { QualityManagerOptions } from './core/QualityManager.js';
export { damp } from './core/damp.js';

export { InputManager } from './input/InputManager.js';
export type { PointerPayload } from './input/InputManager.js';
export { ResizeManager } from './input/ResizeManager.js';
export { ScrollBridge, NativeScrollDriver } from './input/ScrollBridge.js';
export { AnimationBridge } from './input/AnimationBridge.js';
export type { GSAPTimelineLike } from './input/AnimationBridge.js';

export { ResourceRegistry } from './resources/ResourceRegistry.js';
export { AssetLoader } from './resources/AssetLoader.js';
export type { LoadOptions, AssetLoaderApi } from './resources/AssetLoader.js';

export { EventBus } from './events/EventBus.js';
export type { CCWebGLEventMap } from './events/EventBus.js';

export { probeWebGLCapability, mountFallback, wireContextLoss } from './errors/ErrorBoundary.js';
