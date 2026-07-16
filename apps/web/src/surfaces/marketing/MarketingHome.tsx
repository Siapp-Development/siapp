import { Button } from '@siapp/ui';

import { SkipLink } from '@/components/SkipLink.tsx';

/** Marketing landing skeleton at siapp.app/ — real content in a later ticket. */
export function MarketingHome() {
  return (
    <>
      <SkipLink />
      <header className="border-b border-border bg-card px-6 py-4">
        <nav aria-label="Main">
          <span className="text-lg font-semibold text-primary">Siapp</span>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-bold text-foreground">Siapp</h1>
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
