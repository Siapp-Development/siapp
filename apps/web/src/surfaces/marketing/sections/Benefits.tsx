import { Card, CardContent } from '@siapp/ui';

import { SectionHeading } from '../components/SectionHeading.tsx';

const BENEFITS = [
  {
    title: 'Fewer \u201Cany update?\u201D messages',
    body: 'Clients can see current progress and the next milestone without waiting for someone to reply.',
  },
  {
    title: 'Less weekend reporting',
    body: 'Your team updates project work during the week instead of rebuilding the story on Friday night.',
  },
  {
    title: 'A more professional client experience',
    body: 'Every client receives consistent updates and a clear, branded progress page.',
  },
];

/** Benefits — brief §13. No invented numbers. */
export function Benefits() {
  return (
    <section className="bg-muted py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <SectionHeading title="Less project admin. More client trust." align="center" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <Card key={benefit.title}>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {benefit.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
