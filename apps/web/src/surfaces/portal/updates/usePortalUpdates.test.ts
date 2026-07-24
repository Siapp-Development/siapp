/**
 * updateLabel (#21 B4): client-friendly one-liners per activity action.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  Timestamp: class {},
  collection: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

import { updateLabel, type IPortalUpdate } from './usePortalUpdates.ts';

function update(overrides: Partial<IPortalUpdate>): IPortalUpdate {
  return {
    id: 'u1',
    action: 'task_created',
    taskTitleDenorm: '',
    docNameDenorm: '',
    at: null,
    payload: {},
    ...overrides,
  };
}

describe('updateLabel', () => {
  it('labels task events with the denormalised title', () => {
    expect(updateLabel(update({ action: 'task_created', taskTitleDenorm: 'Order tiles' }))).toBe(
      'New task: Order tiles',
    );
    expect(
      updateLabel(
        update({
          action: 'task_status_changed',
          taskTitleDenorm: 'Order tiles',
          payload: { to: 'in_progress' },
        }),
      ),
    ).toBe('Order tiles moved to In progress');
    expect(
      updateLabel(update({ action: 'task_due_date_changed', taskTitleDenorm: 'Order tiles' })),
    ).toBe('Order tiles has a new target date');
  });

  it('labels document events, distinguishing client uploads', () => {
    expect(updateLabel(update({ action: 'doc_added', docNameDenorm: 'Plan.pdf' }))).toBe(
      'New document: Plan.pdf',
    );
    expect(
      updateLabel(update({ action: 'client_document_uploaded', docNameDenorm: 'Photo.png' })),
    ).toBe('You shared Photo.png');
  });

  it('labels lifecycle events and falls back for unknown actions', () => {
    expect(updateLabel(update({ action: 'project_published' }))).toBe('Your project is underway');
    expect(updateLabel(update({ action: 'project_completed' }))).toBe('Your project is complete');
    expect(updateLabel(update({ action: 'something_new' }))).toBe('Project updated');
  });
});
