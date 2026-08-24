/**
 * A single tag chip. Coloured via the shared `tagColorClasses` palette (WCAG
 * AA). When `onRemove` is provided it renders a dismiss button (×) with an
 * accessible name; otherwise it is a static read-only chip.
 */

import type { TTagColor } from '@siapp/shared';
import { cn, tagColorClasses } from '@siapp/ui';

export interface ITagChipProps {
  name: string;
  color: TTagColor;
  /** When set, renders a dismiss button that calls this on click. */
  onRemove?: () => void;
}

export function TagChip({ name, color, onRemove }: ITagChipProps) {
  const classes = tagColorClasses(color);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        classes.chip,
      )}
    >
      {name}
      {onRemove !== undefined && (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="-mr-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full leading-none hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
        >
          <span aria-hidden>×</span>
        </button>
      )}
    </span>
  );
}
