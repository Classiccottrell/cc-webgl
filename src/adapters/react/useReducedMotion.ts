import { useEffect, useState } from 'react';

/** Subscribes to `(prefers-reduced-motion: reduce)`. No local matchMedia call inside
 * FrameScheduler/QualityManager per blueprint §4 — this hook is the one sanctioned
 * consumer-facing entry point for React trees. */
export function useReducedMotion(): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return matches;
}
