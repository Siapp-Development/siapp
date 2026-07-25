import { SectionHeading } from '../components/SectionHeading.tsx';

const STEPS = [
  {
    title: 'Start with a familiar project structure',
    body: 'A new firm begins with a Siapp starter project for its industry or duplicates a successful previous project.',
    support: 'Set the dates, assign your team, add the client, and publish when you are ready.',
  },
  {
    title: 'Run the work in one timeline',
    body: 'Your team updates tasks, milestones, documents, responsibilities, and due dates from one clear workspace.',
    support: 'No need to create a complicated system before the team can start.',
  },
  {
    title: 'Keep the client informed',
    body: 'When visible work changes, Siapp sends an approved WhatsApp update and refreshes the client\u2019s portal.',
    support:
      'The client taps one link and sees the latest progress, upcoming milestone, and shared documents.',
  },
];

/** How it works — brief §9. Three connected steps. */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <SectionHeading eyebrow="How it works" title="From project setup to informed clients in three steps." />
        <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {/* Connector line (decorative) */}
          <span
            aria-hidden="true"
            className="absolute top-5 right-[16%] left-[16%] hidden h-px bg-border md:block"
          />
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative flex gap-4 md:block">
              <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-semibold text-primary-foreground">
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
