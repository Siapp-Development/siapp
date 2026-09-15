/**
 * Pure, per-project builders for the Projects Table view (#166). Each project
 * is its OWN block: that project's phases become the columns (ordered by
 * `phase.order`), with a trailing "No phase" column appended ONLY when the
 * project has tasks with `phaseId: null` (or an orphan phaseId). There is no
 * cross-project column alignment and no phase-name normalization — projects
 * genuinely have heterogeneous phase sets.
 */

import type { IPhaseRow, TTaskListRow } from '../tasks/useTasks.ts';

/** Sentinel key for the trailing "No phase" column / bucket. */
export const NO_PHASE_KEY = null;

export interface IPhaseColumn {
  /** Phase id, or `null` for the trailing "No phase" column. */
  phaseId: string | null;
  /** Display name for the column header. */
  name: string;
}

/**
 * Columns for a single project's block: its phases ordered by `phase.order`
 * (ties broken by id), then a trailing "No phase" column when — and only when —
 * some task has no resolvable phase (`phaseId: null`, or an id absent from
 * `phases`).
 */
export function buildProjectPhaseColumns(
  phases: readonly IPhaseRow[],
  tasks: readonly TTaskListRow[],
): IPhaseColumn[] {
  const ordered = [...phases].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const columns: IPhaseColumn[] = ordered.map((phase) => ({
    phaseId: phase.id,
    name: phase.name,
  }));

  const known = new Set(ordered.map((phase) => phase.id));
  const hasNoPhaseTasks = tasks.some(
    (task) => task.phaseId === null || !known.has(task.phaseId),
  );
  if (hasNoPhaseTasks) {
    columns.push({ phaseId: NO_PHASE_KEY, name: 'No phase' });
  }
  return columns;
}

/**
 * Group tasks under their phase id. Tasks whose `phaseId` is `null` or points at
 * a phase absent from `knownPhaseIds` fall into the `null` bucket ("No phase").
 * Order within a bucket follows the input order (already sorted by the hook).
 */
export function groupTasksByPhase(
  tasks: readonly TTaskListRow[],
  knownPhaseIds: ReadonlySet<string>,
): Map<string | null, TTaskListRow[]> {
  const groups = new Map<string | null, TTaskListRow[]>();
  for (const task of tasks) {
    const key =
      task.phaseId !== null && knownPhaseIds.has(task.phaseId) ? task.phaseId : NO_PHASE_KEY;
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [task]);
    } else {
      bucket.push(task);
    }
  }
  return groups;
}
