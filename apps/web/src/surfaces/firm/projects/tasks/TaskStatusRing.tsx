/**
 * Circular task-status indicator (replaces the status chip on the task list).
 * The ring encodes progress by fill + shape — not colour alone — and carries
 * an sr-only label so the status is still announced and hover-titled:
 *   - todo        → dashed empty ring (muted)          → 0%
 *   - in_progress → partial amber arc (warning)        → mid-progress
 *   - blocked     → red ring with a centre dot (danger)
 *   - done        → filled green disc + check (success)→ 100%
 * Colours are Siapp semantic tokens (warning/success/danger/muted).
 */

import type { TTaskStatus } from '@siapp/shared';

import { TASK_STATUS_LABELS } from './taskLabels.ts';

const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// In-progress fills a bit past half so it reads as "under way".
const IN_PROGRESS_FRACTION = 0.55;

export function TaskStatusRing({ status }: { status: TTaskStatus }) {
  const label = TASK_STATUS_LABELS[status];

  return (
    <span
      title={label}
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center"
    >
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden="true">
        {status === 'todo' && (
          <circle
            cx="10"
            cy="10"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="2.4 2.6"
            strokeLinecap="round"
            className="text-muted-foreground"
          />
        )}

        {status === 'in_progress' && (
          <>
            <circle
              cx="10"
              cy="10"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-warning/25"
            />
            <circle
              cx="10"
              cy="10"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              transform="rotate(-90 10 10)"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - IN_PROGRESS_FRACTION)}
              className="text-warning"
            />
          </>
        )}

        {status === 'blocked' && (
          <>
            <circle
              cx="10"
              cy="10"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-danger"
            />
            <circle cx="10" cy="10" r="2.4" fill="currentColor" className="text-danger" />
          </>
        )}

        {status === 'done' && (
          <>
            <circle cx="10" cy="10" r="8" fill="currentColor" className="text-success" />
            <path
              d="M6.2 10.3l2.4 2.4 5-5.2"
              fill="none"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
