import { buttonVariants, cn } from '@siapp/ui';

import heroVideo from '@/assets/siapp-hero.mp4';

import { CtaLink } from '../components/CtaLink.tsx';
import { useReducedMotion } from '../hooks/useReducedMotion.ts';

/** Hero — copy verbatim from the brief §7. */
export function Hero() {
  const reducedMotion = useReducedMotion();

  return (
    <section className="mx-auto max-w-[var(--mk-container)] px-4 pt-14 pb-[var(--mk-section-y)] sm:px-6 lg:pt-20">
      <div className="flex flex-col items-center gap-12">
        <video
          className="w-full h-auto rounded-xl"
          autoPlay={!reducedMotion}
          loop
          muted
          playsInline
          controls
          preload="metadata"
          aria-label="Siapp in action: a firm marks a project task done, the client instantly receives a WhatsApp update, and their portal progress advances with a new status entry."
        >
          <source src={heroVideo} type="video/mp4" />
        </video>
        <div className="flex max-w-3xl flex-col items-center text-center">
          <p className="text-sm font-semibold tracking-wide text-accent-deep uppercase">
            Client-facing project management for Southeast Asian firms
          </p>
          <h1 className="mk-hero-title mt-4 font-bold text-foreground">
            Every client knows where their project stands.
          </h1>
          <p className="mk-h2 mt-3 font-display text-muted-foreground">
            Without you having to type another status update.
          </p>
          <p className="mk-lede mt-6 text-muted-foreground">
            Siapp helps construction and legal firms run projects in one simple timeline, send
            automatic WhatsApp updates, and give every client a clear view of what is happening
            next.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
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
      </div>
    </section>
  );
}
