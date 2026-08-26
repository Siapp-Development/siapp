/**
 * Project Tasks section (#126, D-042): a compact phase-grouped preview of the
 * client-visible tasks plus a "Show all tasks" button that opens the full
 * List/Timeline modal. Only opt-in (visibleToClient) non-restricted tasks
 * ever reach here — see usePortalTasks / the firestore.rules portal grant.
 */

import { Badge, Button, type IBadgeProps } from '@siapp/ui';
import { ArrowRight } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { PortalAllTasksDialog } from '../tasks/PortalAllTasksDialog.tsx';
import {
  PORTAL_STATUS_LABELS,
  derivePortalStatus,
  type TPortalTaskStatus,
} from '../tasks/portalTaskStatus.ts';
import type { IPortalTaskGroup } from '../tasks/usePortalTasks.ts';

const PREVIEW_PHASES = 2;
const PREVIEW_TASKS_PER_PHASE = 3;

const STATUS_VARIANTS: Record<TPortalTaskStatus, IBadgeProps['variant']> = {
  done: 'success',
  overdue: 'danger',
  blocked: 'warning',
  in_progress: 'primary',
  todo: 'neutral',
};

export interface IPortalTasksSectionProps {
  groups: readonly IPortalTaskGroup[];
  projectName: string;
}

export function PortalTasksSection({ groups, projectName }: IPortalTasksSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const now = useMemo(() => new Date(), []);
  const headingId = useId();

  const totalTasks = groups.reduce((sum, group) => sum + group.tasks.length, 0);
  const previewGroups = groups.slice(0, PREVIEW_PHASES);

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-border bg-card p-4 shadow-card"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-sm font-semibold">
          Project tasks
        </h2>
        {totalTasks > 0 && (
          <span className="text-xs text-muted-foreground">{totalTasks} shared</span>
        )}
      </div>

      {totalTasks === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Your project team hasn&rsquo;t shared any tasks yet.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-4">
            {previewGroups.map((group) => {
              const shown = group.tasks.slice(0, PREVIEW_TASKS_PER_PHASE);
              const hidden = group.tasks.length - shown.length;
              return (
                <div key={group.phaseId ?? '__unphased__'}>
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.name}
                  </h3>
                  <ul className="mt-1.5 space-y-1.5">
                    {shown.map((task) => {
                      const status = derivePortalStatus(task, now);
                      return (
                        <li key={task.id} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm">{task.title}</span>
                          <Badge variant={STATUS_VARIANTS[status]} className="shrink-0">
                            {PORTAL_STATUS_LABELS[status]}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                  {hidden > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">+{hidden} more</p>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="mt-4 print:hidden"
          >
            Show all tasks
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Button>

          <PortalAllTasksDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            groups={groups}
            projectName={projectName}
          />
        </>
      )}
    </section>
  );
}
