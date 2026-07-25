import { Card, CardContent } from '@siapp/ui';

import { SectionHeading } from '../components/SectionHeading.tsx';

const PROBLEM_CARDS = [
  {
    title: 'Spreadsheet maintenance',
    body: 'Your team updates the project sheet, copies information into separate reports, and checks which version is current.',
  },
  {
    title: 'Repeated WhatsApp updates',
    body: 'Project managers type the same progress update into different client groups, often after working hours.',
  },
  {
    title: 'Client uncertainty',
    body: 'Clients still call for updates because they cannot see the complete picture or what will happen next.',
  },
];

/** Problem section — brief §8. Familiar and practical, not fear-based. */
export function Problem() {
  return (
    <section className="bg-muted py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <SectionHeading title="The work is moving. Your client just cannot see it." />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PROBLEM_CARDS.map((card) => (
            <Card key={card.title}>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mk-lede mx-auto mt-12 max-w-2xl text-center font-display font-medium text-foreground">
          Siapp turns project activity into clear client communication automatically.
        </p>
      </div>
    </section>
  );
}
