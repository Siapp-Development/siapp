/**
 * "Show all tasks" modal (#126, D-042). A `<Dialog size="lg">` (native focus
 * trap / Esc / focus restore) hosting a List ↔ Timeline toggle. The toggle is
 * a `role="group"` of `aria-pressed` buttons, fully keyboard operable —
 * mirrors the firm board toggle without importing firm code.
 */

import { Button, Dialog, cn } from '@siapp/ui';
import { Columns3, List, X } from 'lucide-react';
import { useId, useState } from 'react';

import { PortalTaskList } from './PortalTaskList.tsx';
import { PortalTaskTimeline } from './PortalTaskTimeline.tsx';
import type { IPortalTaskGroup } from './usePortalTasks.ts';

type TView = 'list' | 'timeline';

export interface IPortalAllTasksDialogProps {
  open: boolean;
  onClose: () => void;
  groups: readonly IPortalTaskGroup[];
  projectName: string;
}

export function PortalAllTasksDialog({
  open,
  onClose,
  groups,
  projectName,
}: IPortalAllTasksDialogProps) {
  const [view, setView] = useState<TView>('list');
  const titleId = useId();

  return (
    <Dialog open={open} onClose={onClose} size="lg" aria-labelledby={titleId}>
      <div className="flex max-h-[90vh] min-h-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-6 py-4">
          <h2 id={titleId} className="truncate text-base font-semibold">
            Project tasks
            <span className="sr-only"> for {projectName}</span>
          </h2>
          <div className="flex items-center gap-3">
            <div
              role="group"
              aria-label="Task view"
              className="flex rounded-md border border-border p-0.5"
            >
              {(
                [
                  { id: 'list', label: 'List', Icon: List },
                  { id: 'timeline', label: 'Timeline', Icon: Columns3 },
                ] as const
              ).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={view === entry.id}
                  onClick={() => setView(entry.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-3 py-1 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent-deep focus-visible:outline-none',
                    view === entry.id
                      ? 'bg-accent-tint font-medium text-accent-deep'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <entry.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {entry.label}
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {view === 'list' ? (
            <PortalTaskList groups={groups} />
          ) : (
            <PortalTaskTimeline groups={groups} />
          )}
        </div>
      </div>
    </Dialog>
  );
}
