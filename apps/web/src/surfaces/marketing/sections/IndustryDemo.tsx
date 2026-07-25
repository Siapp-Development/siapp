import { useState } from 'react';

import { IndustrySwitcher } from '../components/IndustrySwitcher.tsx';
import { SectionHeading } from '../components/SectionHeading.tsx';
import { DemoPortal } from '../components/demo/DemoPortal.tsx';
import { DemoTimeline } from '../components/demo/DemoTimeline.tsx';
import { DesktopWindow, PhoneFrame } from '../components/demo/DeviceFrames.tsx';
import { WhatsappBubble } from '../components/demo/WhatsappBubble.tsx';
import { INDUSTRY_DEMOS, type TIndustry } from '../components/demo/demoContent.ts';

/** Interactive industry demonstration — brief §10. */
export function IndustryDemo() {
  const [industry, setIndustry] = useState<TIndustry>('construction');
  const demo = INDUSTRY_DEMOS[industry];

  return (
    <section id="industries" className="bg-muted py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <SectionHeading
          eyebrow="Industries"
          title="One simple product. Built around the way your firm works."
          align="center"
        />
        <div className="mt-8 flex justify-center">
          <IndustrySwitcher value={industry} onChange={setIndustry} />
        </div>

        {/* key= forces a remount so the crossfade animation replays per switch */}
        <div
          key={industry}
          className="mt-10 grid animate-[mk-fade_320ms_var(--mk-ease)] items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
        >
          <div className="space-y-4">
            <DesktopWindow title={`${demo.firmName} — ${demo.projectName}`}>
              <DemoTimeline demo={demo} />
            </DesktopWindow>
            <div className="max-w-md">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                WhatsApp update sent to {demo.clientName}
              </p>
              <WhatsappBubble message={demo.whatsappMessage} />
            </div>
          </div>
          <PhoneFrame
            label={`Client portal preview — ${demo.label.toLowerCase()}`}
            className="mx-auto w-full max-w-[19rem]"
          >
            <div data-surface="portal" className="min-h-[26rem]">
              <DemoPortal demo={demo} />
            </div>
          </PhoneFrame>
        </div>
      </div>
    </section>
  );
}
