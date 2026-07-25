import { Suspense, lazy } from 'react';

import { SkipLink } from '@/components/SkipLink.tsx';

import { MarketingFooter } from './components/MarketingFooter.tsx';
import { MarketingNav } from './components/MarketingNav.tsx';
import { Hero } from './sections/Hero.tsx';
import './marketing.css';

const BelowFold = lazy(() => import('./sections/BelowFold.tsx'));

/** Marketing landing page at siapp.app/ (impl-28). */
export function MarketingHome() {
  return (
    <div id="top" className="mk-root bg-background">
      <SkipLink />
      <MarketingNav />
      <main id="main">
        <Hero />
        {/* Reserved min-height keeps CLS at 0 while the chunk loads. */}
        <Suspense fallback={<div aria-hidden="true" className="min-h-[200vh]" />}>
          <BelowFold />
        </Suspense>
      </main>
      <MarketingFooter />
    </div>
  );
}
