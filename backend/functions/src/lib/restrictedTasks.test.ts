import { describe, expect, it } from 'vitest';

import { canSeeRestrictedTask, restrictionsOf, toRestrictedHeader } from './restrictedTasks.js';

describe('canSeeRestrictedTask', () => {
  it('owner and admin bypass restrictions', () => {
    expect(canSeeRestrictedTask('owner', [], ['dep-finance'])).toBe(true);
    expect(canSeeRestrictedTask('admin', [], ['dep-finance'])).toBe(true);
  });

  it('unrestricted tasks are visible to everyone', () => {
    expect(canSeeRestrictedTask('pm', [], [])).toBe(true);
    expect(canSeeRestrictedTask('viewer', [], [])).toBe(true);
  });

  it('requires a matching department for pm/viewer', () => {
    expect(canSeeRestrictedTask('pm', ['dep-structural'], ['dep-structural'])).toBe(true);
    expect(canSeeRestrictedTask('pm', ['dep-interiors'], ['dep-structural'])).toBe(false);
    expect(canSeeRestrictedTask('viewer', [], ['dep-structural'])).toBe(false);
  });

  it('any overlap suffices', () => {
    expect(
      canSeeRestrictedTask('pm', ['dep-a', 'dep-b'], ['dep-c', 'dep-b']),
    ).toBe(true);
  });
});

describe('toRestrictedHeader', () => {
  const due = new Date('2026-08-01T00:00:00.000Z');

  it('projects only the safe fields', () => {
    const header = toRestrictedHeader('t1', {
      title: 'Pour foundation',
      description: 'SECRET pricing details',
      status: 'in_progress',
      phaseId: 'ph1',
      dueDate: { toDate: () => due },
      order: 3,
      restrictedToDepartments: ['dep-finance'],
      assignees: [{ type: 'user', id: 'u1', name: 'Someone' }],
      sendWhatsapp: true,
    });
    expect(header).toEqual({
      id: 't1',
      title: 'Pour foundation',
      status: 'in_progress',
      phaseId: 'ph1',
      dueDate: '2026-08-01T00:00:00.000Z',
      order: 3,
      restrictedToDepartments: ['dep-finance'],
    });
    expect(Object.keys(header)).not.toContain('description');
    expect(Object.keys(header)).not.toContain('assignees');
  });

  it('defaults malformed fields safely', () => {
    const header = toRestrictedHeader('t2', {
      title: 42,
      status: 'nonsense',
      restrictedToDepartments: ['dep-a', 7, null],
    });
    expect(header).toEqual({
      id: 't2',
      title: '',
      status: 'todo',
      phaseId: null,
      dueDate: null,
      order: 0,
      restrictedToDepartments: ['dep-a'],
    });
  });
});

describe('restrictionsOf', () => {
  it('returns the string entries of the restriction list', () => {
    expect(restrictionsOf({ restrictedToDepartments: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('tolerates a missing or malformed field', () => {
    expect(restrictionsOf({})).toEqual([]);
    expect(restrictionsOf({ restrictedToDepartments: 'a' })).toEqual([]);
    expect(restrictionsOf({ restrictedToDepartments: [1, 'a'] })).toEqual(['a']);
  });
});
