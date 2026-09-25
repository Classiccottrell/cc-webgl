// Cube Stress Test — Phase 1 Foundation Verification.
// Not part of the published package (excluded from src/, tsconfig, and exports map).
// Mounts one lit Three.js mesh via SceneManager and exercises, all visibly on-screen:
// resize/reprojection, pointer-driven rotation, ScrollBridge+GSAP coexisting in one RAF
// loop, runtime FULL/REDUCED/FALLBACK quality toggling, prefers-reduced-motion,
// 10x mount/unmount leak assertions, and tab-hide/context-loss recovery.
import * as THREE from 'three';
import gsap from 'gsap';
import {
  SceneManager,
  AnimationBridge,
  damp,
  type Scene,
  type SceneContext,
  type FrameState,
  type QualityTier,
} from '../src/index.js';
import { probeWebGLCapability, mountFallback } from '../src/errors/ErrorBoundary.js';

// ---------------------------------------------------------------------------
// Scene: cube + GSAP-driven color lerp (item 4) + ScrollBridge-driven scale (item 4)
// ---------------------------------------------------------------------------

function makeCubeScene(animBridge: AnimationBridge): Scene {
  let mesh: THREE.Mesh;
  let material: THREE.MeshStandardMaterial;
  let tiltX = 0;
  let tiltY = 0;
  let ctxRef: SceneContext;
  const colorLerp = { t: 0 }; // plain object driven by a paused GSAP timeline — no gsap.ticker RAF
  const colorA = new THREE.Color(0x7f78ff);
  const colorB = new THREE.Color(0xff8f5a);

  const tl = gsap.timeline({ paused: true, repeat: -1, yoyo: true }).to(colorLerp, { t: 1, duration: 4, ease: 'sine.inOut' });
  animBridge.attach(tl);

  return {
    init(ctx: SceneContext) {
      ctxRef = ctx;
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      material = new THREE.MeshStandardMaterial({ color: colorA.clone(), roughness: 0.3, metalness: 0.6 });
      mesh = new THREE.Mesh(geometry, material);
      ctx.scene.add(mesh);
      ctx.resources.track(mesh);

      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      const key = new THREE.DirectionalLight(0xffffff, 1.25);
      key.position.set(0.35, 0.55, 1);
      ctx.scene.add(ambient, key);
      ctx.resources.track(() => {
        ctx.scene.remove(ambient, key);
      });

      ctx.camera.position.set(0, 0, 3);
      ctx.camera.lookAt(0, 0, 0);
    },
    update(frame: FrameState) {
      const ctx = ctxRef;
      const pointer = ctx.input.pointer;
      const targetY = pointer.x * ((24 * Math.PI) / 180);
      const targetX = -pointer.y * ((24 * Math.PI) / 180);
      tiltX = damp(tiltX, targetX, 8, frame.dt);
      tiltY = damp(tiltY, targetY, 8, frame.dt);

      const reduced = document.body.dataset.reducedMotion === 'true';
      const idleSpeed = reduced || ctx.quality.tier === 'FALLBACK' ? 0 : (1.5 * (Math.PI * 2)) / 60;
      mesh.rotation.y = tiltY + frame.elapsed * idleSpeed;
      mesh.rotation.x = tiltX;

      // GSAP timeline advanced explicitly inside this same tick (item 4): no gsap.ticker
      // RAF is running — the timeline is `paused: true` and only ever moves via
      // tl.time() below, so FrameScheduler's single RAF is the only loop driving it.
      tl.time((tl.time() + frame.dt) % tl.duration());
      animBridge.tick();
      material.color.copy(colorA).lerp(colorB, colorLerp.t);

      // ScrollBridge drives a different transform channel (scale) concurrently (item 4).
      const scale = 1 + ctx.scroll.progress * 0.5;
      mesh.scale.setScalar(scale);
    },
    resize(viewport) {
      void viewport; // SceneManager/CameraManager already reproject; readout wired via 'resize' event below.
    },
    dispose() {
      // ResourceRegistry.disposeAll() (called by SceneManager.dispose) handles GPU
      // teardown; nothing extra needed here. GSAP timeline is a plain JS-object tween,
      // no DOM/GL handles to release.
    },
  };
}

export function mountCubeStressTest(container: HTMLElement): { manager: SceneManager; animBridge: AnimationBridge; destroy: () => void } {
  const animBridge = new AnimationBridge();
  const scene = makeCubeScene(animBridge);
  const manager = new SceneManager(container, scene);
  return {
    manager,
    animBridge,
    destroy: () => manager.dispose(),
  };
}

// ---------------------------------------------------------------------------
// HUD scaffolding
// ---------------------------------------------------------------------------

function el(tag: string, style: Partial<CSSStyleDeclaration>, text?: string): HTMLElement {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text) e.textContent = text;
  return e;
}

const panelStyle: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  font: '12px/1.5 monospace',
  color: '#fff',
  background: 'rgba(0,0,0,0.65)',
  padding: '8px 10px',
  borderRadius: '4px',
  zIndex: '10',
  whiteSpace: 'pre',
};

// ---------------------------------------------------------------------------
// Main harness — mounts everything, wires all 8 checklist items to visible UI.
// ---------------------------------------------------------------------------

export function runManualStressHarness(container: HTMLElement): void {
  container.style.position = 'relative';

  // --- item 2: viewport readout, re-subscribed on every mount (dispose() clears eventBus) ---
  const viewportReadout = el('div', { ...panelStyle, top: '8px', left: '8px' });
  container.appendChild(viewportReadout);

  // --- item 5: quality tier buttons ---
  const qualityPanel = el('div', { ...panelStyle, top: '8px', right: '8px', display: 'flex', gap: '6px' });
  const tierButtons: Record<QualityTier, HTMLButtonElement> = {} as any;
  (['FULL', 'REDUCED', 'FALLBACK'] as QualityTier[]).forEach((tier) => {
    const btn = document.createElement('button');
    btn.textContent = tier;
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', () => setTier(tier));
    tierButtons[tier] = btn;
    qualityPanel.appendChild(btn);
  });
  container.appendChild(qualityPanel);

  // --- item 6: reduced-motion state readout ---
  const motionReadout = el('div', { ...panelStyle, top: '56px', left: '8px' });
  container.appendChild(motionReadout);

  // --- item 8: context-loss + pause/resume buttons ---
  const contextPanel = el('div', { ...panelStyle, bottom: '8px', left: '8px', display: 'flex', gap: '6px', flexDirection: 'column', alignItems: 'flex-start' });
  const loseBtn = document.createElement('button');
  loseBtn.textContent = 'Simulate WebGL context loss/restore';
  loseBtn.style.cursor = 'pointer';
  const pauseBtn = document.createElement('button');
  pauseBtn.textContent = 'Pause (simulate tab-hide)';
  pauseBtn.style.cursor = 'pointer';
  const contextStatus = el('div', {}, 'context: live');
  contextPanel.append(loseBtn, pauseBtn, contextStatus);
  container.appendChild(contextPanel);

  // --- item 7: leak-check readout ---
  const leakReadout = el('div', { ...panelStyle, bottom: '8px', right: '8px', minWidth: '220px' });
  container.appendChild(leakReadout);

  // Scene mount slot: a child div so FALLBACK's mountFallback()/canvas swap has a clean
  // container to attach into/detach from, without fighting the HUD siblings above.
  const sceneSlot = el('div', { position: 'absolute', inset: '0', zIndex: '0' });
  container.insertBefore(sceneSlot, container.firstChild);

  let current = mountCubeStressTest(sceneSlot);
  let fallbackEl: HTMLElement | null = null;
  let paused = false;

  function wireViewportReadout(): void {
    current.manager.eventBus.on('resize', (vp) => {
      viewportReadout.textContent = `viewport: ${vp.width}x${vp.height} @ dpr ${vp.dpr.toFixed(2)} (aspect ${vp.aspect.toFixed(3)})`;
    });
    current.manager.eventBus.on('context-lost', () => (contextStatus.textContent = 'context: LOST'));
    current.manager.eventBus.on('context-restored', () => (contextStatus.textContent = 'context: restored'));
  }

  function highlightTier(tier: QualityTier): void {
    (Object.keys(tierButtons) as QualityTier[]).forEach((t) => {
      tierButtons[t].style.fontWeight = t === tier ? 'bold' : 'normal';
      tierButtons[t].style.outline = t === tier ? '2px solid #7f78ff' : 'none';
    });
  }

  // item 5: FALLBACK cannot swap in-place (SceneManager never builds a WebGL context on
  // FALLBACK) — dispose + remount across the WebGL<->DOM-fallback boundary; FULL<->REDUCED
  // updates the live renderer's DPR/shadows via setQualityTier() without a remount.
  async function setTier(tier: QualityTier): Promise<void> {
    highlightTier(tier);
    const wasFallback = fallbackEl !== null;
    if (tier === 'FALLBACK') {
      if (!wasFallback) {
        current.destroy();
        fallbackEl = mountFallback(sceneSlot, 'Interactive scene unavailable (FALLBACK tier forced)');
        Object.assign(fallbackEl.style, { background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: '14px monospace' });
        fallbackEl.textContent = 'FALLBACK: DOM placeholder (no WebGL context)';
      }
      return;
    }
    if (wasFallback) {
      fallbackEl?.remove();
      fallbackEl = null;
      current = mountCubeStressTest(sceneSlot);
      await current.manager.mount();
      wireViewportReadout();
    }
    current.manager.setQualityTier(tier);
  }

  wireViewportReadout();
  current.manager.mount().then(() => highlightTier('FULL'));

  loseBtn.addEventListener('click', () => {
    const canvas = sceneSlot.querySelector('canvas');
    if (!canvas) return;
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) {
      contextStatus.textContent = 'context: WEBGL_lose_context unsupported';
      return;
    }
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 1000);
  });

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    if (paused) {
      current.manager.pause();
      pauseBtn.textContent = 'Resume';
    } else {
      current.manager.resume();
      pauseBtn.textContent = 'Pause (simulate tab-hide)';
    }
  });

  // item 6: prefers-reduced-motion — actually stops idle rotation (read by scene.update
  // via document.body.dataset.reducedMotion) and reflects state on screen.
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  const applyReducedMotion = (matches: boolean) => {
    document.body.dataset.reducedMotion = String(matches);
    motionReadout.textContent = `prefers-reduced-motion: ${matches ? 'REDUCE (idle rotation stopped)' : 'no-preference'}`;
  };
  applyReducedMotion(mql.matches);
  mql.addEventListener('change', (e) => applyReducedMotion(e.matches));

  // --- item 7: 10x mount/unmount stress test with real leak assertions ---
  runLeakCheck(leakReadout, sceneSlot).catch((err) => {
    leakReadout.textContent = `leak check errored: ${String(err)}`;
  });
}

// Monkey-patches EventTarget listener add/remove globally to count outstanding
// listeners as a leak signal; example-only instrumentation, never shipped in src/.
function installListenerCounter(): () => number {
  let count = 0;
  const origAdd = EventTarget.prototype.addEventListener;
  const origRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (...args: Parameters<typeof origAdd>) {
    count += 1;
    return origAdd.apply(this, args);
  };
  EventTarget.prototype.removeEventListener = function (...args: Parameters<typeof origRemove>) {
    count -= 1;
    return origRemove.apply(this, args);
  };
  return () => count;
}

async function runLeakCheck(readout: HTMLElement, slot: HTMLElement): Promise<void> {
  const getListenerCount = installListenerCounter();

  readout.textContent = 'leak check: running mount 0/10...';

  // Dedicated scratch container, isolated from the live HUD scene above.
  const scratch = document.createElement('div');
  scratch.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(scratch);

  // Warm-up cycle (not counted/asserted): normalizes one-time lazy global registrations
  // (e.g. gsap's internal ticker listener, registered once on first tween and never
  // torn down since gsap.ticker is a process-lifetime singleton, not scene-scoped) so
  // the baseline below reflects steady-state, not first-mount-only setup cost.
  const warmup = mountCubeStressTest(scratch);
  await warmup.manager.mount();
  warmup.destroy();

  const baselineListeners = getListenerCount();
  const baselineCanvases = scratch.querySelectorAll('canvas').length; // always 0, kept for symmetry with post-cycle check

  let results: string[] = [];
  let allPass = true;

  for (let i = 1; i <= 10; i++) {
    const instance = mountCubeStressTest(scratch);
    await instance.manager.mount();
    const resourceCount = instance.manager.resourceRegistry.report().reduce((sum, r) => sum + r.count, 0);
    instance.destroy();

    const postResourceCount = instance.manager.resourceRegistry.report().reduce((sum, r) => sum + r.count, 0);
    const postListeners = getListenerCount();
    const postCanvases = scratch.querySelectorAll('canvas').length;

    const pass =
      resourceCount > 0 && // sanity: mount actually tracked something
      postResourceCount === 0 &&
      postListeners === baselineListeners &&
      postCanvases === baselineCanvases;
    if (!pass) allPass = false;

    results.push(`cycle ${i}/10: resources ${resourceCount}->${postResourceCount}, listeners ${postListeners}(base ${baselineListeners}), canvases ${postCanvases} ${pass ? 'PASS' : 'FAIL'}`);
    readout.textContent = `leak check: ${results[results.length - 1]}`;
    console.log('[cube-stress-test]', results[results.length - 1]);
  }

  scratch.remove();
  const summary = `leak check: ${allPass ? 'PASS' : 'FAIL'} 10/10 cycles (see console for per-cycle detail)`;
  readout.textContent = summary;
  console.log('[cube-stress-test]', summary, results);
}
