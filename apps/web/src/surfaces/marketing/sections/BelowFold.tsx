import { Benefits } from './Benefits.tsx';
import { ClientPortalSection } from './ClientPortalSection.tsx';
import { Differentiation } from './Differentiation.tsx';
import { Faq } from './Faq.tsx';
import { FinalCta } from './FinalCta.tsx';
import { HowItWorks } from './HowItWorks.tsx';
import { IndustryDemo } from './IndustryDemo.tsx';
import { InternalProduct } from './InternalProduct.tsx';
import { OutcomesStrip } from './OutcomesStrip.tsx';
import { Problem } from './Problem.tsx';
import { Trust } from './Trust.tsx';

/**
 * Everything below the hero, bundled into one lazy chunk so the initial
 * marketing paint ships only nav + hero + demo. Default export for
 * React.lazy.
 */
export default function BelowFold() {
  return (
    <>
      <Problem />
      <HowItWorks />
      <IndustryDemo />
      <ClientPortalSection />
      <InternalProduct />
      <Benefits />
      <Differentiation />
      <OutcomesStrip />
      <Trust />
      <Faq />
      <FinalCta />
    </>
  );
}
