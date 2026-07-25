import { Card, CardContent } from '@siapp/ui';

import { SectionHeading } from '../components/SectionHeading.tsx';

const CARDS = [
  {
    title: 'Client visibility is built in',
    body: 'Every live project can have a simple client-facing progress view.',
  },
  {
    title: 'WhatsApp is part of the workflow',
    body: 'Notifications are connected to project activity instead of being copied manually.',
  },
  {
    title: 'Designed for Southeast Asian firms',
    body: 'The product is shaped around local communication habits, industries, currency, and business sizes.',
  },
  {
    title: 'Opinionated simplicity',
    body: 'Siapp helps firms start with a useful structure rather than asking them to build an entire operating system from scratch.',
  },
];

/** Differentiation — brief §14. Composed and confident, no competitor attacks. */
export function Differentiation() {
  return (
    <section className="py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <SectionHeading title="Not another blank project-management tool." />
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {CARDS.map((card) => (
            <Card key={card.title}>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
