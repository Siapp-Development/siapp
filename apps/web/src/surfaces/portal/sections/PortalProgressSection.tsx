/**
 * Overall Progress section (#126, D-042): the server-maintained
 * project.progressPct (D5) shown as an accessible CircularProgress ring. No
 * client-side recomputation, and no timespan bar (dropped by D-042).
 */

import { CircularProgress } from '@siapp/ui';
import { useId } from 'react';

export interface IPortalProgressSectionProps {
  progressPct: number;
}

export function PortalProgressSection({ progressPct }: IPortalProgressSectionProps) {
  const value = Math.min(100, Math.max(0, Math.round(progressPct)));
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-border bg-card p-4 shadow-card"
    >
      <h2 id={headingId} className="text-sm font-semibold">
        Overall progress
      </h2>
      <div className="mt-4 flex justify-center">
        <CircularProgress
          value={value}
          label={`${value}% complete`}
          size={140}
          indicatorClassName="text-accent"
        >
          <span className="font-display text-3xl font-bold tabular-nums">{value}%</span>
        </CircularProgress>
      </div>
    </section>
  );
}
