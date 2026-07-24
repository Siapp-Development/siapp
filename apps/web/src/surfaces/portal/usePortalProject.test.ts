/**
 * Pure helpers from the portal project hook (#21 B2): current-phase pick and
 * next-milestone pick. The live subscriptions are left to integration tests.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  Timestamp: class {},
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
}));

import {
  currentPhase,
  nextMilestone,
  type IPortalMilestone,
  type IPortalPhase,
} from './usePortalProject.ts';

function phase(id: string, status: IPortalPhase['status']): IPortalPhase {
  return { id, name: id, order: 0, status };
}

function milestone(id: string, completedAt: Date | null): IPortalMilestone {
  return { id, name: id, targetDate: new Date('2026-03-01'), completedAt, description: '' };
}

describe('currentPhase', () => {
  it('prefers the first in-progress phase', () => {
    expect(
      currentPhase([phase('a', 'done'), phase('b', 'in_progress'), phase('c', 'todo')])?.id,
    ).toBe('b');
  });

  it('falls back to the first todo phase when nothing is in progress', () => {
    expect(currentPhase([phase('a', 'done'), phase('b', 'todo')])?.id).toBe('b');
  });

  it('falls back to the last phase when everything is done', () => {
    expect(currentPhase([phase('a', 'done'), phase('b', 'done')])?.id).toBe('b');
  });

  it('returns null with no phases', () => {
    expect(currentPhase([])).toBeNull();
  });
});

describe('nextMilestone', () => {
  it('picks the first incomplete milestone (list is target-date ordered)', () => {
    expect(
      nextMilestone([milestone('done', new Date('2026-01-05')), milestone('next', null)])?.id,
    ).toBe('next');
  });

  it('returns null when every milestone is complete or none exist', () => {
    expect(nextMilestone([milestone('done', new Date('2026-01-05'))])).toBeNull();
    expect(nextMilestone([])).toBeNull();
  });
});
