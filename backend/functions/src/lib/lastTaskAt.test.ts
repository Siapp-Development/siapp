import { describe, expect, it } from 'vitest';

import { collaboratorIdsToStamp } from './lastTaskAt.js';

function task(
  status: string,
  assignees: unknown = [
    { type: 'user', id: 'u1', name: 'Alice' },
    { type: 'collaborator', id: 'col1', name: 'Lim', phone: '+60198765432' },
    { type: 'collaborator', id: 'col2', name: 'Tan', phone: '+60111222333' },
  ],
): Record<string, unknown> {
  return { status, assignees };
}

describe('collaboratorIdsToStamp', () => {
  it('returns collaborator ids when a task transitions to done', () => {
    expect(collaboratorIdsToStamp(task('in_progress'), task('done'))).toEqual(['col1', 'col2']);
  });

  it('stamps on create straight to done', () => {
    expect(collaboratorIdsToStamp(undefined, task('done'))).toEqual(['col1', 'col2']);
  });

  it('ignores user assignees and dedupes collaborator ids', () => {
    const after = task('done', [
      { type: 'user', id: 'u1', name: 'Alice' },
      { type: 'collaborator', id: 'col1', name: 'Lim', phone: '+60198765432' },
      { type: 'collaborator', id: 'col1', name: 'Lim', phone: '+60198765432' },
    ]);
    expect(collaboratorIdsToStamp(task('todo'), after)).toEqual(['col1']);
  });

  it('returns nothing when the status is not done', () => {
    expect(collaboratorIdsToStamp(task('todo'), task('in_progress'))).toEqual([]);
  });

  it('returns nothing when the task was already done (idempotent)', () => {
    expect(collaboratorIdsToStamp(task('done'), task('done'))).toEqual([]);
  });

  it('returns nothing on delete', () => {
    expect(collaboratorIdsToStamp(task('done'), undefined)).toEqual([]);
  });

  it('tolerates malformed assignees', () => {
    expect(collaboratorIdsToStamp(task('todo'), task('done', 'junk'))).toEqual([]);
    expect(collaboratorIdsToStamp(task('todo'), task('done', [null, 42, { type: 'collaborator' }]))).toEqual([]);
  });
});
