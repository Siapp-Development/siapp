import { useState } from 'react';

import { cn } from '@siapp/ui';

import { track } from '../lib/track.ts';
import { ChevronDownIcon } from './icons.tsx';

export interface IFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface IFaqAccordionProps {
  items: IFaqItem[];
}

/**
 * Accessible accordion: each trigger is a real button inside an h3, with
 * aria-expanded/aria-controls; panel height animates via the CSS grid-rows
 * trick (disabled automatically under reduced motion).
 */
export function FaqAccordion({ items }: IFaqAccordionProps) {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        track('faq_opened', { question: id });
      }
      return next;
    });
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
      {items.map((item) => {
        const open = openIds.has(item.id);
        return (
          <div key={item.id}>
            <h3>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`faq-panel-${item.id}`}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-medium text-foreground"
                onClick={() => {
                  toggle(item.id);
                }}
              >
                {item.question}
                <ChevronDownIcon
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--mk-dur-fast)]',
                    open && 'rotate-180',
                  )}
                />
              </button>
            </h3>
            <div id={`faq-panel-${item.id}`} className="mk-collapse" data-open={open}>
              <div>
                <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
