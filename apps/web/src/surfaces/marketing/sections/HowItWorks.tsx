import { cn } from '@siapp/ui';

import { SectionHeading } from '../components/SectionHeading.tsx';

const STEPS = [
  {
    title: 'Start with a familiar project structure',
    body: 'A new firm begins with a Siapp starter project for its industry or duplicates a successful previous project.',
    support: 'Set the dates, assign your team, add the client, and publish when you are ready.',
    badgeClass: 'bg-accent text-primary-foreground',
  },
  {
    title: 'Run the work in one timeline',
    body: 'Your team updates tasks, milestones, documents, responsibilities, and due dates from one clear workspace.',
    support: 'No need to create a complicated system before the team can start.',
    badgeClass: 'bg-warning text-primary-foreground',
  },
  {
    title: 'Keep the client informed',
    body: 'When visible work changes, Siapp sends an approved WhatsApp update and refreshes the client\u2019s portal.',
    support:
      'The client taps one link and sees the latest progress, upcoming milestone, and shared documents.',
    badgeClass: 'bg-success text-primary-foreground',
  },
];

/** How it works — brief §9. Three connected steps. */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <SectionHeading eyebrow="How it works" title="From project setup to informed clients in three steps." />
        <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative flex gap-4 md:block">
              {/* Connector to the next step's badge (decorative, desktop only). */}
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-5 left-5 hidden h-px w-[calc(100%+2rem)] bg-border md:block"
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold',
                  step.badgeClass,
                )}
              >
                {i + 1}
              </span>
              <div className="md:mt-5">
                <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground">{step.body}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.support}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
