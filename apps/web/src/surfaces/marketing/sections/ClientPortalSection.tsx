import { useEffect } from 'react';

import { CheckIcon } from '../components/icons.tsx';
import { SectionHeading } from '../components/SectionHeading.tsx';
import { DemoPortal } from '../components/demo/DemoPortal.tsx';
import { PhoneFrame } from '../components/demo/DeviceFrames.tsx';
import { CONSTRUCTION_DEMO } from '../components/demo/demoContent.ts';
import { useInViewOnce } from '../hooks/useInViewOnce.ts';
import { track } from '../lib/track.ts';

const SUPPORT_POINTS = [
  {
    title: 'No app installation',
    body: 'Clients open a link in the browser they already have. Nothing to download, nothing to update.',
  },
  {
    title: 'No client seat charge',
    body: 'Clients are always free. Share the portal with every client on every live project.',
  },
  {
    title: 'No complicated dashboard',
    body: 'One page: progress, current phase, next milestone, recent updates, and shared documents.',
  },
];

/** Client portal feature section — brief §11. Warm portal treatment. */
export function ClientPortalSection() {
  const { ref, inView } = useInViewOnce<HTMLElement>();

  useEffect(() => {
    if (inView) {
      track('client_portal_preview_viewed');
    }
  }, [inView]);

  return (
    <section
      id="client-portal"
      ref={ref}
      data-surface="portal"
      className="bg-background py-[var(--mk-section-y)]"
    >
      <div className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <SectionHeading
          eyebrow="Client portal"
          title="A project view your clients will actually understand."
          lede="Clients do not need to learn project-management software. They receive a WhatsApp link and see one clear page showing where the project stands."
        />
        <div className="mt-12 grid items-start gap-12 lg:grid-cols-2">
          <PhoneFrame
            label="Full client portal preview"
            className="mx-auto w-full max-w-[20rem] lg:sticky lg:top-24"
          >
            <DemoPortal demo={CONSTRUCTION_DEMO} full />
          </PhoneFrame>
          <ul className="space-y-10 lg:py-8">
            {SUPPORT_POINTS.map((point) => (
              <li key={point.title} className="flex gap-4">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-deep"
                  aria-hidden="true"
                >
                  <CheckIcon className="size-4" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{point.title}</h3>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {point.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
