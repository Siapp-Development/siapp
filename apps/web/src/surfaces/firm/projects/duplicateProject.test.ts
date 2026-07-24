/**
 * Pure planner tests for #15 duplicate project (D-031): structure carries,
 * content clears, phaseId/dependsOn remap through pre-generated ids.
 */

import { describe, expect, it, vi } from 'vitest';

// duplicateProject.ts pulls in the Firestore writer alongside the pure
// planner; stub the app singletons so importing it never boots Firebase.
vi.mock('@/lib/firebase.ts', () => ({ db: {} }));
vi.mock('@/lib/callables.ts', () => ({ getRestrictedTaskHeaders: vi.fn() }));

import {
  buildDuplicatePlan,
  type IDuplicatePhaseSource,
  type IDuplicateTaskSource,
} from './duplicateProject.ts';

function stubIdFor(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `new-${n}`;
  };
}

function phaseSource(overrides: Partial<IDuplicatePhaseSource> = {}): IDuplicatePhaseSource {
  return { id: 'ph-1', name: 'Site prep', order: 1, ...overrides };
}

function taskSource(overrides: Partial<IDuplicateTaskSource> = {}): IDuplicateTaskSource {
  return {
    id: 't-1',
    title: 'Pour foundation',
    description: '',
    phaseId: null,
    order: 1,
    visibleToClient: false,
    restrictedToDepartments: [],
    sendWhatsapp: false,
    dependsOn: [],
    ...overrides,
  };
}

describe('buildDuplicatePlan', () => {
  it('assigns fresh ids to phases and tasks in order', () => {
    const plan = buildDuplicatePlan(
      [phaseSource({ id: 'ph-1' }), phaseSource({ id: 'ph-2', order: 2 })],
      [taskSource({ id: 't-1' })],
      stubIdFor(),
    );

    expect(plan.phases.map((phase) => phase.id)).toEqual(['new-1', 'new-2']);
    expect(plan.tasks.map((task) => task.id)).toEqual(['new-3']);
  });

  it('remaps phaseId to the copied phase and nulls dangling references', () => {
    const plan = buildDuplicatePlan(
      [phaseSource({ id: 'ph-1' })],
      [
        taskSource({ id: 't-1', phaseId: 'ph-1' }),
        taskSource({ id: 't-2', phaseId: 'ph-deleted', order: 2 }),
        taskSource({ id: 't-3', phaseId: null, order: 3 }),
      ],
      stubIdFor(),
    );

    expect(plan.tasks[0]?.phaseId).toBe('new-1');
    expect(plan.tasks[1]?.phaseId).toBeNull();
    expect(plan.tasks[2]?.phaseId).toBeNull();
  });

  it('remaps dependsOn to copied task ids and drops dangling entries', () => {
    const plan = buildDuplicatePlan(
      [],
      [
        taskSource({ id: 't-1' }),
        taskSource({ id: 't-2', order: 2, dependsOn: ['t-1', 't-deleted'] }),
      ],
      stubIdFor(),
    );

    expect(plan.tasks[0]?.dependsOn).toEqual([]);
    expect(plan.tasks[1]?.dependsOn).toEqual(['new-1']);
  });

  it('carries structure and clears content on tasks', () => {
    const plan = buildDuplicatePlan(
      [],
      [
        taskSource({
          id: 't-1',
          title: 'Wire panels',
          description: 'Per spec §4',
          order: 7,
          visibleToClient: true,
          restrictedToDepartments: ['dep-electrical'],
          sendWhatsapp: true,
        }),
      ],
      stubIdFor(),
    );

    const task = plan.tasks[0];
    // Carried per D-031.
    expect(task).toMatchObject({
      title: 'Wire panels',
      description: 'Per spec §4',
      order: 7,
      visibleToClient: true,
      restrictedToDepartments: ['dep-electrical'],
      sendWhatsapp: true,
    });
    // Cleared per D-031 (status resets to the shipped 'todo' enum, decision 7).
    expect(task?.status).toBe('todo');
    expect(task?.assignees).toEqual([]);
    expect(task?.visibleToCollaboratorIds).toEqual([]);
    expect(task).not.toHaveProperty('startDate');
    expect(task).not.toHaveProperty('dueDate');
    expect(task).not.toHaveProperty('completedAt');
    expect(task).not.toHaveProperty('createdBy');
  });

  it('carries phase name and order and resets phase status', () => {
    const plan = buildDuplicatePlan(
      [phaseSource({ id: 'ph-1', name: 'Fit-out', order: 4 })],
      [],
      stubIdFor(),
    );

    expect(plan.phases[0]).toEqual({ id: 'new-1', name: 'Fit-out', order: 4, status: 'todo' });
  });

  it('returns an empty plan for a structureless project', () => {
    expect(buildDuplicatePlan([], [], stubIdFor())).toEqual({ phases: [], tasks: [] });
  });
});
