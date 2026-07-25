import { CheckIcon } from '../components/icons.tsx';
import { SectionHeading } from '../components/SectionHeading.tsx';

const TRUST_POINTS = [
  'Construction and legal workflows first',
  'Mobile-friendly for teams and clients',
  'WhatsApp and SMS communication',
  'Controlled client visibility',
  'Audit history for project activity',
  'PDPA-conscious product design',
];

/** Trust section — brief §16. Truthful; no manufactured social proof. */
export function Trust() {
  return (
    <section className="py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <SectionHeading title="Built for the way Malaysian firms already work." />
        <ul className="mt-10 grid max-w-3xl gap-x-12 gap-y-4 sm:grid-cols-2">
          {TRUST_POINTS.map((point) => (
            <li key={point} className="flex items-center gap-3">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary"
                aria-hidden="true"
              >
                <CheckIcon className="size-3.5" />
              </span>
              <span className="text-sm font-medium text-foreground">{point}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-muted-foreground italic">
          Siapp is currently working with early design partners in Malaysia.
        </p>
      </div>
    </section>
  );
}
