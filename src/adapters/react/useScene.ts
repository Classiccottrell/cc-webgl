import { useEffect, useRef } from 'react';
import { SceneManager } from '../../core/SceneManager.js';
import type { Scene } from '../../types.js';

/** Mounts a Scene into a container ref via SceneManager; disposes on unmount. */
export function useScene(containerRef: React.RefObject<HTMLElement>, scene: Scene): void {
  const managerRef = useRef<SceneManager | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const manager = new SceneManager(container, scene);
    managerRef.current = manager;
    manager.mount();

    return () => {
      manager.dispose();
      managerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, scene]);
}
