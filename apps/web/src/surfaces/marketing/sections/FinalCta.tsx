import siappLogoReversed from '@/assets/siapp-logo-simple-reversed.png';

import { CtaLink } from '../components/CtaLink.tsx';

/**
 * Final conversion section — brief §17, adapted per the Typeform decision:
 * one strong CTA to the external form instead of an inline lead form.
 */
export function FinalCta() {
  return (
    <section className="bg-primary-deep py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 text-center sm:px-6">
        <img src={siappLogoReversed} alt="" className="mx-auto h-12 w-12" />
        <h2 className="mk-h2 mx-auto mt-6 max-w-2xl font-bold text-white">
          Make every project clearer to your client.
        </h2>
        <p className="mk-lede mx-auto mt-4 max-w-xl text-white/80">
          Join the early-access list for Siapp and help shape a simpler way for Southeast Asian
          firms to run client-facing projects.
        </p>
        <div className="mt-8 flex justify-center">
          <CtaLink
            location="final"
            size="lg"
            className="bg-accent-deep text-accent-foreground hover:bg-accent"
          />
        </div>
        <p className="mt-4 text-sm text-white/60">
          Takes under a minute. We will only use your information to contact you about Siapp.
        </p>
      </div>
    </section>
  );
}
