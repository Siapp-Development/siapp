/**
 * Accessible checkbox primitive: a native `<input type="checkbox">` with the
 * project focus ring and an `indeterminate` state (which the DOM only exposes
 * imperatively, so it is synced onto the node via a ref). Consumers give it an
 * accessible name with a wrapping `<label>` or an `aria-label`.
 */

import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from 'react';

import { cn } from '../lib/cn.ts';

export interface ICheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Mixed state (e.g. a partially-selected group header). */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, ICheckboxProps>(function Checkbox(
  { className, indeterminate = false, ...props },
  ref,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);

  // `indeterminate` is not a reflected HTML attribute — it must be assigned on
  // the DOM node directly whenever it (or the node) changes.
  useEffect(() => {
    if (innerRef.current !== null) {
      innerRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref !== null) {
          ref.current = node;
        }
      }}
      type="checkbox"
      aria-checked={indeterminate ? 'mixed' : undefined}
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded border border-border accent-primary',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
