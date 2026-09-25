# BRIEF — cc-webgl

> The canonical starting point for a new project. Fill every section before any
> implementation begins. The Engineering Manager agent reads this first.

## Goal
A lightweight, framework-agnostic TypeScript WebGL/Three.js foundation shared across
future interactive-site projects (Perspective/Shotforge, Forma/ShapeLab, Route
Grapher, Fictional Architecture Reconstructions). Solves rendering lifecycle, input
normalization, scroll authority, performance tiering, accessibility fallbacks, asset
loading, and GPU resource disposal once, so downstream projects build product logic
only.

## Non-Goals
- No project-specific styling, copy, or business logic (zero brand leaks).
- No React dependency in core — React support is an optional adapter subpath only.
- No CJS build; no npm registry publish in Phase 0.
- Not a full post-processing / VFX framework — quality tiers gate effects, they don't
  implement them.
- No monorepo/workspace tooling introduced at the root of Directory_CC.

## Constraints
- `three` is a peerDependency, not a dependency — never bundle or duplicate THREE.
- Single `requestAnimationFrame` loop for the whole package (FrameScheduler owns it).
- All GPU/CPU resources must have an audited disposal path via ResourceRegistry.
- No user-agent sniffing for quality-tier detection.
- Must run standalone via `file:../cc-webgl` from sibling `Projects/` folders; no root
  workspace manifest assumed.

## Stack
- TypeScript, ESM only.
- three.js (peer dependency).
- Vite (lib mode, multi-entry: `.` and `./react`) for build.
- vitest + happy-dom for unit tests (FrameScheduler, ResourceRegistry, EventBus,
  QualityManager, ScrollBridge math only — no WebGL/renderer tests, jsdom has no GL).
- Optional peers: react, gsap, lenis.

## Acceptance Criteria
- [ ] All files in the Architect blueprint's §1 file list exist with the specified
      responsibilities.
- [ ] `SceneContext`, `Scene`, `ScrollState` interfaces implemented literally as
      specified (no field renames, no added required fields).
- [ ] `npm run build` produces `dist/index.js` + `dist/react/index.js` + `.d.ts` via
      separate entry points; importing `cc-webgl` alone does not pull in React.
- [ ] `npm run typecheck` and `npm test` pass; unit tests cover FrameScheduler dt-clamp
      + visibility pause, ResourceRegistry track/dispose (GPU + CPU escape hatch),
      EventBus typed emit/subscribe, QualityManager tier selection + hysteresis,
      ScrollBridge derived-state math.
- [ ] Mascot3D.tsx renderer-bootstrap, camera-framing, and disposal logic verified
      ported per the blueprint's §4 table (spot-checked, not re-derived from scratch).
- [ ] FALLBACK tier renders no WebGL canvas; `Scene.init` is never called when tier is
      FALLBACK.
- [ ] `README.md` documents how a sibling project consumes cc-webgl via `file:` path.

## Status
**planning**

| Date       | Update            |
|------------|-------------------|
| 2026-09-16 | Project scaffolded from Phase 0 architect blueprint. |
| 2026-09-16 | Phase 1 (Cube Stress Test) completion pass: all 8 checklist items demonstrated live in `example/` (resize/reproject readout, ScrollBridge+GSAP in one frame loop, runtime FULL/REDUCED/FALLBACK toggle, prefers-reduced-motion, 10x mount/unmount leak assertions, WebGL context-loss simulation + pause/resume). `npm run dev` serves it via Vite. See README.md "Cube Stress Test" section for detail and the `QualityManager`/`SceneManager`/`AnimationBridge` API additions this required. Fixed a pre-existing `ScrollBridge` bug (`Illegal invocation` on real browsers) found while verifying. |
