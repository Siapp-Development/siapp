/**
 * Generic accessible SVG progress ring. Ports the proven ring math from the
 * firm TaskProgressRing (radius chosen so the circumference reads ~100 units)
 * into a reusable value/label primitive. Meaning is never carried by color
 * alone: an `aria-label` names the value and optional center content is
 * decorative (`aria-hidden`).
 */

import type { ReactNode } from 'react';

import { cn } from '../lib/cn.ts';

export interface ICircularProgressProps {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  /** Accessible name for the ring (e.g. "45% complete"). */
  label: string;
  /** Rendered pixel size of the square SVG. Defaults to 96. */
  size?: number;
  /** Stroke width in viewBox units (the viewBox is a fixed 36×36). */
  strokeWidth?: number;
  /** Utility class for the background track circle. */
  trackClassName?: string;
  /** Utility class for the progress indicator arc. */
  indicatorClassName?: string;
  className?: string;
  /** Decorative center content (e.g. the percent text). */
  children?: ReactNode;
}

// Radius chosen so the circumference is ~100 units, letting the arc's
// stroke-dasharray read directly as a percentage.
const RADIUS = 15.915_494_309_189_533;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CircularProgress({
  value,
  label,
  size = 96,
  strokeWidth = 3,
  trackClassName,
  indicatorClassName,
  className,
  children,
}: ICircularProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={cn('text-border', trackClassName)}
        />
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className={cn(
            'text-accent transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none',
            indicatorClassName,
          )}
        />
      </svg>
      {children !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          {children}
        </div>
      )}
    </div>
  );
}
