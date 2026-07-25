import { cn } from '@siapp/ui';

import { CheckIcon } from '../icons.tsx';
import type { IIndustryDemo } from './demoContent.ts';

export interface IDemoTimelineProps {
  demo: IIndustryDemo;
  className?: string;
}

/**
 * Stylized firm-side timeline: phase rail + task rows. Visual DNA copied
 * from the real firm timeline board — not imported (bundle isolation).
 */
export function DemoTimeline({ demo, className }: IDemoTimelineProps) {
  const currentIdx = demo.phases.indexOf(demo.currentPhase);

  return (
    <div className={cn('p-4', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{demo.projectName}</p>
        <p className="text-xs text-muted-foreground">{demo.firmName}</p>
      </div>

      {/* Phase rail */}
      <ol className="mt-3 flex items-center gap-1" aria-label={`${demo.projectLabel} phases`}>
        {demo.phases.map((phase, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming';
          return (
            <li key={phase} className="min-w-0 flex-1">
              <span
                className={cn(
                  'block h-1.5 rounded-full',
                  state === 'done' && 'bg-primary',
                  state === 'current' && 'bg-accent',
                  state === 'upcoming' && 'bg-muted',
                )}
              />
              <span className="sr-only">
                {phase} — {state === 'done' ? 'complete' : state === 'current' ? 'in progress' : 'upcoming'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Current phase: <span className="font-medium text-foreground">{demo.currentPhase}</span>
      </p>

      {/* Task rows */}
      <ul className="mt-3 space-y-1.5">
        {demo.tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center gap-2.5 rounded-md border border-border bg-background px-2.5 py-2"
          >
            <span
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full border',
                task.status === 'done' && 'border-success bg-success text-white',
                task.status === 'in-progress' && 'border-accent bg-accent-tint',
                task.status === 'todo' && 'border-border bg-card',
              )}
              aria-hidden="true"
            >
              {task.status === 'done' && <CheckIcon className="size-2.5" />}
            </span>
            <span
              className={cn(
                'flex-1 truncate text-[0.8125rem]',
                task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground',
              )}
            >
              {task.title}
            </span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-medium',
                task.status === 'done' && 'bg-success-tint text-success',
                task.status === 'in-progress' && 'bg-accent-tint text-accent-deep',
                task.status === 'todo' && 'bg-muted text-muted-foreground',
              )}
            >
              {task.status === 'done' ? 'Done' : task.status === 'in-progress' ? 'In progress' : 'To do'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
