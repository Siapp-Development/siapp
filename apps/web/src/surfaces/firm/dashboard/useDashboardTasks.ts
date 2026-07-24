/**
 * Cross-project task reads for the #17 dashboard: a per-project fan-out of
 * the same rules-provable query set the project board uses (D1) — no
 * collection-group query, no rules changes, restricted tasks are physically
 * unfetchable for pm/viewer. Listener count = actionable projects ×
 * (1 + claim departments); at MVP volume that stays well under Firestore
 * limits. If a firm ever runs ~50+ active projects, switch each onSnapshot
 * to a one-shot getDocs — a drop-in change per query.
 */

import type { TMemberRole } from '@siapp/shared';
import { onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { mapTask, taskQueriesFor, type ITaskRow } from '../projects/tasks/useTasks.ts';
import type { IProjectRow } from '../projects/useProjects.ts';

/** A task row tagged with its source project for cross-project rendering. */
export interface IDashboardTaskRow extends ITaskRow {
  projectId: string;
  projectName: string;
}

export type TDashboardTasksState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IDashboardTaskRow[] };

/** Projects whose tasks are actionable on the dashboard (D1). */
export function isActionableProject(row: IProjectRow): boolean {
  return (
    (row.lifecycle === 'draft' || row.lifecycle === 'published') && row.status !== 'archived'
  );
}

export function useDashboardTasks(
  workspaceId: string,
  role: TMemberRole,
  departments: string[],
  projects: readonly IProjectRow[],
): TDashboardTasksState {
  const seesEverything = role === 'owner' || role === 'admin';
  // Stable keys so the effect doesn't resubscribe on every projects snapshot.
  const departmentsKey = departments.join('\u0000');
  const actionableIdsKey = projects
    .filter(isActionableProject)
    .map((p) => p.id)
    .sort()
    .join('\u0000');

  // Rows per subscription, keyed `projectId\u0000queryIndex`.
  const [docsByKey, setDocsByKey] = useState<Map<string, ITaskRow[]> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDocsByKey(null);
    setFailed(false);
    const deps = departmentsKey === '' ? [] : departmentsKey.split('\u0000');
    const projectIds = actionableIdsKey === '' ? [] : actionableIdsKey.split('\u0000');
    const unsubscribes = projectIds.flatMap((projectId) => {
      const tasksPath = `workspaces/${workspaceId}/projects/${projectId}/tasks`;
      return taskQueriesFor(tasksPath, seesEverything, deps).map((q, index) =>
        onSnapshot(
          q,
          (snapshot) => {
            const rows = snapshot.docs.map((docSnap) => mapTask(docSnap.id, docSnap.data()));
            setDocsByKey((prev) => {
              const next = new Map(prev ?? []);
              next.set(`${projectId}\u0000${index}`, rows);
              return next;
            });
          },
          () => setFailed(true),
        ),
      );
    });
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [workspaceId, seesEverything, departmentsKey, actionableIdsKey]);

  const queriesPerProject =
    1 + (seesEverything || departmentsKey === '' ? 0 : departmentsKey.split('\u0000').length);
  const projectCount = actionableIdsKey === '' ? 0 : actionableIdsKey.split('\u0000').length;
  const expectedSubscriptions = projectCount * queriesPerProject;

  // Project names are attached at merge time (not in the effect) so a rename
  // doesn't tear down and rebuild every listener.
  const namesById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  return useMemo(() => {
    if (failed) {
      return { status: 'error' as const };
    }
    if (
      expectedSubscriptions > 0 &&
      (docsByKey === null || docsByKey.size < expectedSubscriptions)
    ) {
      return { status: 'loading' as const };
    }
    const byId = new Map<string, IDashboardTaskRow>();
    for (const [key, rows] of docsByKey ?? []) {
      const projectId = key.split('\u0000')[0] ?? '';
      for (const row of rows) {
        byId.set(`${projectId}\u0000${row.id}`, {
          ...row,
          projectId,
          projectName: namesById.get(projectId) ?? '',
        });
      }
    }
    return { status: 'ready' as const, rows: [...byId.values()] };
  }, [docsByKey, failed, expectedSubscriptions, namesById]);
}
