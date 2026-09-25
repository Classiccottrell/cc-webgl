import type { EventBus } from '../events/EventBus.js';
import type { CCWebGLEventMap } from '../events/EventBus.js';

/** Framework-agnostic: WebGL capability probe, DOM/SVG fallback mount, context-loss ->
 * EventBus. */
export function probeWebGLCapability(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return !!gl;
  } catch {
    return false;
  }
}

export function mountFallback(container: HTMLElement, label = 'Interactive scene unavailable'): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  el.style.width = '100%';
  el.style.height = '100%';
  container.appendChild(el);
  return el;
}

export function wireContextLoss(
  canvas: HTMLCanvasElement,
  events: EventBus<CCWebGLEventMap>
): () => void {
  const onLost = (e: Event) => {
    e.preventDefault();
    events.emit('context-lost', { canvas });
  };
  const onRestored = () => events.emit('context-restored', { canvas });
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return () => {
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}
