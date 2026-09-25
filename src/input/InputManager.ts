export interface PointerPayload {
  x: number; // -1..1, container-relative (deviation from Mascot3D's -0.5..0.5 source range — see below)
  y: number; // -1..1
}

/** Normalizes pointer/touch/wheel/keyboard into typed payloads.
 * DEVIATION: Mascot3D L114-126 normalizes pointer position to -0.5..0.5. This port
 * changes the range to -1..1 per blueprint §4's explicit instruction. Consumers doing
 * their own tilt-max scaling must account for the doubled range. */
export class InputManager {
  private container: HTMLElement;
  private listeners = { pointerX: 0, pointerY: 0 };
  private handlePointerMove: (e: PointerEvent) => void;
  private handlePointerLeave: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.handlePointerMove = (e: PointerEvent) => {
      const r = this.container.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      this.listeners.pointerX = x;
      this.listeners.pointerY = y;
    };
    this.handlePointerLeave = () => {
      this.listeners.pointerX = 0;
      this.listeners.pointerY = 0;
    };
    container.addEventListener('pointermove', this.handlePointerMove);
    container.addEventListener('pointerleave', this.handlePointerLeave);
  }

  get pointer(): PointerPayload {
    return { x: this.listeners.pointerX, y: this.listeners.pointerY };
  }

  destroy(): void {
    this.container.removeEventListener('pointermove', this.handlePointerMove);
    this.container.removeEventListener('pointerleave', this.handlePointerLeave);
  }
}
