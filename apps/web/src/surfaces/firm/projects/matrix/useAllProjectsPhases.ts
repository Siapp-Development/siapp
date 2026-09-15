/**
 * Phases fan-out for the Projects Table view (#166). Manages one phases
 * subscription per capped project id and exposes `Map<projectId, IPhaseRow[]>`
 * plus aggregate state, feeding each project block's OWN columns. Phases are not
 * department-restricted, so this is a plain collection read per project (the
 * same query shape used everywhere) — no new rules or indexes.
 *
 * Bounded by design: the caller (`ProjectsTableView`) caps the project list, so
 * the number of live listeners here stays small.
 */

import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/lib/firebase.ts';
import { mapPhase, type IPhaseRow } from '../tasks/useTasks.ts';

export type TAllPhasesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; phasesByProject: ReadonlyMap<string, IPhaseRow[]> };

export function useAllProjectsPhases(
  workspaceId: string,
  projectIds: readonly string[],
): TAllPhasesState {
  // Stable key so the effect doesn't resubscribe on every render.
  const idsKey = projectIds.join('\u0000');

  const [rowsByProject, setRowsByProject] = useState<Map<string, IPhaseRow[]> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setRowsByProject(null);
    setFailed(false);
    const ids = idsKey === '' ? [] : idsKey.split('\u0000');
    if (ids.length === 0) {
      setRowsByProject(new Map());
      return;
    }
    const unsubscribes = ids.map((projectId) =>
      onSnapshot(
        collection(db, `workspaces/${workspaceId}/projects/${projectId}/phases`),
        (snapshot) => {
          const rows = snapshot.docs
            .map((docSnap) => mapPhase(docSnap.id, docSnap.data()))
            .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
          setRowsByProject((prev) => {
            const next = new Map(prev ?? []);
            next.set(projectId, rows);
            return next;
          });
        },
        () => setFailed(true),
      ),
    );
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [workspaceId, idsKey]);

  const expectedCount = idsKey === '' ? 0 : idsKey.split('\u0000').length;

  return useMemo<TAllPhasesState>(() => {
    if (failed) {
      return { status: 'error' };
    }
    if (rowsByProject === null || rowsByProject.size < expectedCount) {
      return { status: 'loading' };
    }
    return { status: 'ready', phasesByProject: rowsByProject };
  }, [rowsByProject, failed, expectedCount]);
}
