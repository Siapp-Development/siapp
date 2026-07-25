import { useState } from 'react';

import { cn } from '@siapp/ui';

import { SectionHeading } from '../components/SectionHeading.tsx';
import { ArrowRightIcon } from '../components/icons.tsx';

interface IOutcomeState {
  id: string;
  label: string;
  content: string;
}

const STATES: IOutcomeState[] = [
  { id: 'firm', label: 'Firm workspace', content: 'Roof installation \u2192 Done' },
  { id: 'whatsapp', label: 'WhatsApp', content: 'Your project has a new update' },
  { id: 'portal', label: 'Client portal', content: 'Progress 68% \u00B7 Next: Ceiling works' },
];

/**
 * "One update, three outcomes" strip — brief §15. A stepped button group
 * (not tabs — each step shows one short line) operable by click and keyboard.
 */
export function OutcomesStrip() {
  const [active, setActive] = useState(0);

  return (
    <section className="bg-muted py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <SectionHeading title="Update once. Everything stays aligned." align="center" />
        <div className="mx-auto mt-10 max-w-3xl">
          <ol className="grid gap-3 sm:grid-cols-3">
            {STATES.map((state, i) => {
              const isActive = i === active;
              return (
                <li key={state.id} className="relative">
                  <button
                    type="button"
                    aria-pressed={isActive}
                    className={cn(
                      'h-full w-full rounded-xl border p-4 text-left transition-colors duration-[var(--mk-dur-fast)]',
                      isActive
                        ? 'border-accent bg-card shadow-card'
                        : 'border-border bg-card/60 hover:bg-card',
                    )}
                    onClick={() => {
                      setActive(i);
                    }}
                    onMouseEnter={() => {
                      setActive(i);
                    }}
                    onFocus={() => {
                      setActive(i);
                    }}
                  >
                    <span className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {i + 1}. {state.label}
                    </span>
                    <span
                      className={cn(
                        'mt-2 block text-sm font-medium',
                        isActive ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {state.content}
                    </span>
                  </button>
                  {i < STATES.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 -right-2.5 z-10 hidden -translate-y-1/2 text-accent sm:block"
                    >
                      <ArrowRightIcon className="size-4" />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
