# cc-webgl

A lightweight, framework-agnostic TypeScript WebGL/Three.js foundation shared across
future interactive-site projects under `Projects/` (Perspective/Shotforge,
Forma/ShapeLab, Route Grapher, Fictional Architecture Reconstructions). Solves
rendering lifecycle, input normalization, scroll authority, performance tiering,
accessibility fallbacks, asset loading, and GPU resource disposal once, so downstream
projects build product logic only, not rendering plumbing.

Status: implemented (Phase 0 + Phase 1 Cube Stress Test verification). See `BRIEF.md`
and `.architect-blueprint.md` for the full spec (file list, interfaces, build tooling,
Mascot3D.tsx port map).

## Consumption Model

No root workspace manifest exists at `Directory_CC` — `Projects/` is a folder of
independent projects, not a monorepo. `cc-webgl` is consumed by sibling projects as a
local file dependency during in-workspace development:

```json
{
  "dependencies": {
    "cc-webgl": "file:../cc-webgl"
  }
}
```

For consumers that are independently cloned/remoted repos (cannot rely on a sibling
`Projects/` folder existing), the escape hatch is a git-tag pin once `cc-webgl` has its
own remote: `"cc-webgl": "github:<org>/cc-webgl#v0.1.0"`. Not available until `cc-webgl`
is tagged — `file:` is the only supported path in Phase 0.

`three` is a peerDependency of `cc-webgl` — consumers must install their own `three`
to avoid duplicate THREE copies / dual GL contexts. `react`, `gsap`, `lenis` are
optional peers, only needed if the consumer uses the `cc-webgl/react` adapter subpath
or attaches a GSAP/Lenis bridge.

## Install / Build

From `Projects/cc-webgl/`:

```bash
npm install
npm run build             # tsc --emitDeclarationOnly, then vite build (multi-entry: `.` + `./react`)
npm run typecheck         # tsc --noEmit (src/ only)
npm run typecheck:example # tsc -p example/tsconfig.json --noEmit (example/ only; root tsconfig excludes it)
npm test                  # vitest run (happy-dom; FrameScheduler/ResourceRegistry/EventBus/
                           # QualityManager/ScrollBridge math only — no WebGL/renderer tests)
npm run dev                # vite --config example/vite.config.ts; serves example/index.html
                            # at http://localhost:5173 (or next free port)
```

`npm run build` produces `dist/index.js` (+ `.d.ts`) and `dist/react/index.js`
(+ `dist/adapters/react/index.d.ts`) as separate entry points — importing `cc-webgl`
alone never pulls in React.

### Cube Stress Test (Phase 1 verification harness)

`example/cube-stress-test.ts` (+ `example/index.html`, `example/vite.config.ts`) is not
part of the published package — excluded from `src/`, `tsconfig.json`, and the
`exports` map. `gsap` is a devDependency (root `package.json`) purely so the example can
import it directly; it stays an optional peerDependency of the published package.

Run `npm run dev` from `Projects/cc-webgl/` and open the printed localhost URL. The
page renders one lit, pointer-tiltable cube with an on-screen HUD that demonstrates, all
live (not just console-logged):

- **Resize/reprojection** — a `W×H @ dpr` readout wired to `SceneManager`'s `resize`
  event, updated by `ResizeManager` -> `CameraManager.updateViewport` on every observed
  container-size change.
- **ScrollBridge + GSAP in one frame loop** — page scroll drives cube scale
  (`ctx.scroll.progress`) while a `paused` GSAP timeline (advanced explicitly via
  `tl.time(...)` inside `scene.update`, never `gsap.ticker`) drives a color lerp — both
  read inside the same `FrameScheduler` task, no second RAF loop.
- **Runtime FULL/REDUCED/FALLBACK toggle** — three buttons call
  `SceneManager.setQualityTier()` (new; wraps `QualityManager.forceTier()`, which
  latches past frame-time hysteresis) for FULL/REDUCED, updating live DPR/shadows via
  `RendererManager.setQuality()`; FALLBACK disposes the WebGL mount and swaps in
  `mountFallback()`'s DOM placeholder, since `SceneManager` never builds a WebGL context
  on that tier.
- **prefers-reduced-motion** — actually stops idle rotation (not just logged) and shows
  current state.
- **10x mount/unmount leak check** — asserts `ResourceRegistry.report()` count and a
  global `addEventListener`/`removeEventListener` counter (example-only instrumentation)
  return to a post-warm-up baseline after every one of 10 cycles; pass/fail shown
  on-screen and in console.
- **Context-loss + pause/resume** — a button fires `WEBGL_lose_context`'s
  `loseContext()`/`restoreContext()` pair on the live canvas; a second button calls
  `manager.pause()`/`resume()` as the manual stand-in for real tab-hide (document.hidden
  is read-only, so `visibilitychange` can't be synthetically dispatched with a useful
  `hidden` value from a script — real tab switching is the only way to exercise
  `FrameScheduler`'s own `visibilitychange` pause path).

New public API surface added for this: `QualityManager.forceTier()` /
`.releaseOverride()`, `SceneManager.setQualityTier()` / `.resourceRegistry` /
`.qualityManager` getters, `AnimationBridge.progress` / `.duration` getters. All
additive — no existing signatures changed.

`SceneManager.setQualityTier('FALLBACK')` is rejected for a live WebGL mount.
Dispose and remount across the WebGL/DOM boundary, as the example does.

**Fixed while wiring this up:** `ScrollBridge`'s default `setIdleTimeout` assigned the
bare `setTimeout` reference to `this.setIdleTimeout`, then invoked it as
`this.setIdleTimeout(...)` — real browsers throw `Illegal invocation` on that (native
function losing its `window` receiver), silently uncaught by vitest's happy-dom
environment. Now wrapped as `(fn, ms) => setTimeout(fn, ms)`.

## Layout

```
cc-webgl/
├── BRIEF.md                  ← requirements + status
├── README.md                 ← this file
├── .architect-blueprint.md   ← Phase 0 technical blueprint (file list, interfaces, build tooling, port map)
├── package.json / tsconfig.json / vite.config.ts / vitest.config.ts
├── src/                      ← core, input, resources, events, errors, adapters/react
├── tests/                    ← vitest unit tests (math/logic only, no WebGL)
├── example/                  ← Cube Stress Test proof-of-concept (not published)
├── active/                   ← work in progress
└── archive/                  ← superseded or paused work
```

Full source layout is specified in `.architect-blueprint.md` §1.

### Known deviations from the blueprint

- `SceneContext` carries `scene: THREE.Scene` and `viewport: ViewportState` beyond the
  confirmed literal spec — `scene` is required for `SceneManager` to hand a render
  target to `RendererManager.render()`, and `viewport` holds the init-time value;
  authoritative post-mount updates flow through the now-required `Scene.resize()`
  instead of a mutated ctx field. `SceneContext`'s fields are otherwise unreadonly (no
  `readonly` modifiers) to match the literal spec and support in-place mutation by
  `SceneManager` (`viewport`, `scroll`) across a stable object identity for the
  lifetime of a mount.
- `package.json`'s `./react` `types` path is `./dist/adapters/react/index.d.ts` (the
  real `tsc --emitDeclarationOnly` output path with `rootDir: src`), not
  `./dist/react/index.d.ts` as sketched in the blueprint's essentials snippet — the
  `import` path (`./dist/react/index.js`) does match, via Vite's multi-entry lib build.
- `vite.config.ts` sets `emptyOutDir: false` — the default `true` deletes the `.d.ts`
  files `tsc --emitDeclarationOnly` just wrote, since it runs before `vite build` in
  the same `npm run build` script.
- `three` peer range pinned to `^0.185.1` (the version already used by
  `Projects/TerryTime`), not the blueprint's placeholder `^0.16x`.
- No lint script/config — blueprint §3 lists only `build`/`test`/`typecheck`; no
  ESLint config exists in `.architect-blueprint.md` §1's file list.
- `example/` is a task-directed addition (Cube Stress Test PoC), not in blueprint §1's
  file list; kept out of `src/`, the `exports` map, and the root `tsconfig.json`
  program (own `example/tsconfig.json`).
