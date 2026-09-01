import { cva } from 'class-variance-authority';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '../lib/cn.ts';

export interface ISegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional leading icon (decorative — rendered `aria-hidden`). */
  icon?: ReactNode;
}

export interface ISegmentedControlProps<T extends string> {
  options: readonly ISegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Required accessible group name, e.g. "Timeline granularity". */
  'aria-label': string;
  size?: 'sm' | 'md';
  className?: string;
}

const segmentVariants = cva(
  'inline-flex items-center gap-1.5 rounded whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
  {
    variants: {
      size: {
        sm: 'px-3 py-1 text-sm',
        md: 'px-4 py-1.5 text-sm',
      },
      active: {
        true: 'bg-primary-tint font-medium text-primary-deep',
        false: 'text-muted-foreground hover:text-foreground',
      },
    },
    defaultVariants: {
      size: 'sm',
      active: false,
    },
  },
);

/**
 * Accessible segmented control implemented as an ARIA radio group: a single
 * choice from a small set of options, fully keyboard operable (Arrow keys move
 * and select, Home/End jump to the ends) with roving `tabIndex`. Mirrors the
 * existing view-toggle's active styling (`bg-primary-tint`/`text-primary-deep`)
 * with design tokens. Shared by the firm and portal timelines (D-036/D-037).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  size = 'sm',
  className,
}: ISegmentedControlProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveTo(index: number): void {
    const count = options.length;
    if (count === 0) {
      return;
    }
    const clamped = ((index % count) + count) % count;
    const option = options[clamped];
    if (option === undefined) {
      return;
    }
    onChange(option.value);
    buttonRefs.current[clamped]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        moveTo(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveTo(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        moveTo(0);
        break;
      case 'End':
        event.preventDefault();
        moveTo(options.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-md border border-border p-0.5', className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={segmentVariants({ size, active: checked })}
          >
            {option.icon !== undefined && (
              <span aria-hidden="true" className="inline-flex shrink-0">
                {option.icon}
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { segmentVariants };
