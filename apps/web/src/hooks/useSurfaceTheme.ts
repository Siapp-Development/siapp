import { useEffect } from 'react';

type TSurface = 'firm' | 'portal';

/**
 * Sets the [data-surface] theme attribute on <html> for the lifetime of the
 * calling route tree. Used by the apex external trees (/p, /t) to switch to
 * the warm portal palette; the marketing root keeps the default.
 */
export function useSurfaceTheme(surface: TSurface): void {
  useEffect(() => {
    const previous = document.documentElement.dataset.surface;
    document.documentElement.dataset.surface = surface;

    return () => {
      if (previous === undefined) {
        delete document.documentElement.dataset.surface;
      } else {
        document.documentElement.dataset.surface = previous;
      }
    };
  }, [surface]);
}
