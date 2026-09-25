import { useEffect, useState } from 'react';
import { ScrollBridge } from '../../input/ScrollBridge.js';
import type { ScrollState } from '../../types.js';

const INITIAL: ScrollState = {
  y: 0,
  previousY: 0,
  velocity: 0,
  direction: 0,
  progress: 0,
  isScrolling: false,
  timestamp: 0,
};

/** Standalone scroll subscription (own ScrollBridge instance) for components that
 * need ScrollState outside a SceneManager-owned scene. */
export function useScrollState(): ScrollState {
  const [state, setState] = useState<ScrollState>(INITIAL);

  useEffect(() => {
    const bridge = new ScrollBridge();
    let raf = 0;
    const poll = () => {
      setState(bridge.scroll);
      raf = requestAnimationFrame(poll);
    };
    bridge.start();
    raf = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(raf);
      bridge.stop();
    };
  }, []);

  return state;
}
