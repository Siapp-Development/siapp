import { useEffect, useRef, useState } from 'react';

/**
 * Reveal-on-scroll helper: returns a ref plus an `inView` flag that flips
 * true once when the element enters the viewport (never back). Used for the
 * .mk-reveal section-entry transitions and for view-once analytics events.
 */
export function useInViewOnce<T extends HTMLElement>(threshold = 0.25): {
  ref: React.RefObject<T>;
  inView: boolean;
} {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el === null || inView) {
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true); // jsdom / very old browsers: show content immediately
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [threshold, inView]);

  return { ref, inView };
}
