import { Button } from '@siapp/ui';

import siappLogoFull from '@/assets/siapp-logo-full.png';
import { SkipLink } from '@/components/SkipLink.tsx';

/** Marketing landing skeleton at siapp.app/ — real content in a later ticket. */
export function MarketingHome() {
  return (
    <>
      <SkipLink />
      <header className="border-b border-border bg-card px-6 py-4">
        <nav aria-label="Main">
          <img src={siappLogoFull} alt="Siapp" className="h-8 w-auto" />
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-6 py-16">
        <h1>
          <img src={siappLogoFull} alt="Siapp" className="h-20 w-auto" />
        </h1>
        <p className="mt-4 text-lg">
          Simple project tracking for small firms — keep clients and collaborators in the loop
          without the busywork.
        </p>
        <Button asChild className="mt-8">
          <a href="https://dashboard.siapp.app">Go to your dashboard</a>
        </Button>
      </main>
    </>
  );
}
