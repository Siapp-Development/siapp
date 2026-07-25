import { useRef } from 'react';

import { cn } from '@siapp/ui';

import { track } from '../lib/track.ts';
import type { TIndustry } from './demo/demoContent.ts';

export interface IIndustrySwitcherProps {
  value: TIndustry;
  onChange: (industry: TIndustry) => void;
}

const OPTIONS: { value: TIndustry; label: string }[] = [
  { value: 'construction', label: 'Construction' },
  { value: 'legal', label: 'Legal' },
];

/**
 * Two-option segmented control (radiogroup with roving tabindex + arrow
 * keys) that swaps the industry demo content in place.
 */
export function IndustrySwitcher({ value, onChange }: IIndustrySwitcherProps) {
  const refs = useRef<Map<TIndustry, HTMLButtonElement>>(new Map());

  function select(industry: TIndustry) {
    if (industry !== value) {
      onChange(industry);
      track(industry === 'construction' ? 'industry_view_construction' : 'industry_view_legal');
    }
    refs.current.get(industry)?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      select(value === 'construction' ? 'legal' : 'construction');
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Industry"
      className="inline-flex rounded-lg border border-border bg-muted p-1"
      onKeyDown={onKeyDown}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el !== null) {
                refs.current.set(option.value, el);
              }
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={cn(
              'rounded-md px-5 py-2 text-sm font-medium transition-colors duration-[var(--mk-dur-fast)]',
              selected
                ? 'bg-card text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => {
              select(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
