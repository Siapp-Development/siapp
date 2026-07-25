import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => {}; // jsdom: no matchMedia — nothing to observe
  }
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => {
    mql.removeEventListener('change', onChange);
  };
}

function getSnapshot(): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false;
}

/**
 * True when the user prefers reduced motion. The global CSS kill-switch
 * already neutralizes CSS animations; this hook lets JS-driven sequences
 * (demo timelines, autoplay) skip straight to their end state.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
