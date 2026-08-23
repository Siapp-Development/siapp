/**
 * Small circular completion donut for a phase group's task list (#104).
 * Presentational SVG ring plus an accessible click-to-reveal tooltip that
 * spells out the completion count so meaning is never carried by color alone.
 */

import { cn } from '@siapp/ui';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface ITaskProgressRingProps {
  /** Number of readable tasks marked done. */
  completed: number;
  /** Total number of tasks in the group. */
  total: number;
}

// Radius chosen so the circumference is ~100 units, letting the arc's
// stroke-dasharray read directly as a percentage.
const RADIUS = 15.915_494_309_189_533;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TaskProgressRing({ completed, total }: ITaskProgressRingProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  const safeTotal = Math.max(total, 0);
  const safeCompleted = Math.min(Math.max(completed, 0), safeTotal);
  const fraction = safeTotal === 0 ? 0 : safeCompleted / safeTotal;
  const isComplete = safeTotal > 0 && safeCompleted === safeTotal;
  const label = `${safeCompleted} out of ${safeTotal} tasks completed`;

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: PointerEvent): void {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:outline-none"
      >
        <svg viewBox="0 0 36 36" className="h-7 w-7 -rotate-90" aria-hidden="true">
          <circle
            cx="18"
            cy="18"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-border"
          />
          <circle
            cx="18"
            cy="18"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            className={cn(
              'transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none',
              isComplete ? 'text-success' : 'text-primary',
            )}
          />
        </svg>
      </button>
      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute top-full right-0 z-10 mt-1 rounded-md border border-border bg-card px-2 py-1 text-xs whitespace-nowrap text-foreground shadow-card"
        >
          {label}
        </div>
      )}
    </div>
  );
}
