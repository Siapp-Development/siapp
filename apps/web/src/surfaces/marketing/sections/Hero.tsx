import { buttonVariants, cn } from '@siapp/ui';

import { CtaLink } from '../components/CtaLink.tsx';
import { HeroWorkflowDemo } from '../components/demo/HeroWorkflowDemo.tsx';

/** Hero — copy verbatim from the brief §7. */
export function Hero() {
  return (
    <section className="mx-auto max-w-[var(--mk-container)] px-4 pt-14 pb-[var(--mk-section-y)] sm:px-6 lg:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]">
        <div>
          <p className="text-sm font-semibold tracking-wide text-accent-deep uppercase">
            Client-facing project management for Southeast Asian firms
          </p>
          <h1 className="mk-hero-title mt-4 font-bold text-foreground">
            Every client knows where their project stands.
          </h1>
          <p className="mk-h2 mt-3 font-display text-muted-foreground">
            Without you having to type another status update.
          </p>
          <p className="mk-lede mt-6 max-w-xl text-muted-foreground">
            Siapp helps construction and legal firms run projects in one simple timeline, send
            automatic WhatsApp updates, and give every client a clear view of what is happening
            next.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <CtaLink location="hero" size="lg" />
            <a
              href="#how-it-works"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
            >
              See how Siapp works
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No client app to install. No complicated setup. Clients are always free.
          </p>
        </div>
        <HeroWorkflowDemo />
      </div>
    </section>
  );
}
