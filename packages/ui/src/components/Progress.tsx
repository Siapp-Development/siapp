import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn.ts';

export interface IProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  /** Accessible name for the progressbar. */
  label: string;
  /** Bar fill utility class; defaults to the primary brand color. */
  indicatorClassName?: string;
}

/** Accessible determinate progress bar. */
export function Progress({
  value,
  label,
  className,
  indicatorClassName,
  ...props
}: IProgressProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-200',
          indicatorClassName,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
