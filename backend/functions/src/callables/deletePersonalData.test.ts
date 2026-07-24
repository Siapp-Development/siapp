/**
 * Pure gate tests for deletePersonalData (#26): payload validation and the
 * assignee scrub. The claims gate is covered in lib/callableAuth via
 * exportProject.test.ts; the full erasure walkthrough runs in the emulator.
 */

import { describe, expect, it } from 'vitest';

import { PDPA_REDACTED } from '../lib/pdpa.js';
import { parseDeletePersonalDataArgs, scrubAssignees } from './deletePersonalData.js';

describe('parseDeletePersonalDataArgs', () => {
  it('accepts a valid client and collaborator payload', () => {
    expect(
      parseDeletePersonalDataArgs({ workspaceId: 'w1', subjectType: 'client', subjectId: 'c1' }),
    ).toEqual({ workspaceId: 'w1', subjectType: 'client', subjectId: 'c1' });
    expect(
      parseDeletePersonalDataArgs({
        workspaceId: 'w1',
        subjectType: 'collaborator',
        subjectId: 'col1',
      }),
    ).toEqual({ workspaceId: 'w1', subjectType: 'collaborator', subjectId: 'col1' });
  });

  it('rejects missing or malformed fields', () => {
    expect(() => parseDeletePersonalDataArgs(undefined)).toThrowError(/required/);
    expect(() => parseDeletePersonalDataArgs({})).toThrowError(/required/);
    expect(() =>
      parseDeletePersonalDataArgs({ workspaceId: '', subjectType: 'client', subjectId: 'c1' }),
    ).toThrowError(/required/);
    expect(() =>
      parseDeletePersonalDataArgs({ workspaceId: 'w1', subjectType: 'member', subjectId: 'u1' }),
    ).toThrowError(/required/);
    expect(() =>
      parseDeletePersonalDataArgs({ workspaceId: 'w1', subjectType: 'client', subjectId: '' }),
    ).toThrowError(/required/);
  });
});

describe('scrubAssignees', () => {
  const assignees = [
    { type: 'user', id: 'u1', name: 'Alice' },
    { type: 'collaborator', id: 'col1', name: 'Lim', phone: '+60111111111' },
    { type: 'collaborator', id: 'col2', name: 'Tan', phone: '+60122222222' },
  ];

  it('anonymizes only the subject entry (name + phone)', () => {
    const scrubbed = scrubAssignees(assignees, 'col1', 'Deleted collaborator');
    expect(scrubbed).toEqual([
      { type: 'user', id: 'u1', name: 'Alice' },
      { type: 'collaborator', id: 'col1', name: 'Deleted collaborator', phone: PDPA_REDACTED },
      { type: 'collaborator', id: 'col2', name: 'Tan', phone: '+60122222222' },
    ]);
  });

  it('returns null when the subject is not assigned (no write needed)', () => {
    expect(scrubAssignees(assignees, 'col9', 'Deleted collaborator')).toBeNull();
    expect(scrubAssignees([], 'col1', 'Deleted collaborator')).toBeNull();
    expect(scrubAssignees(undefined, 'col1', 'Deleted collaborator')).toBeNull();
    expect(scrubAssignees('nope', 'col1', 'Deleted collaborator')).toBeNull();
  });

  it('returns null on an already-scrubbed entry (idempotent re-run)', () => {
    const erased = [
      { type: 'collaborator', id: 'col1', name: 'Deleted collaborator', phone: PDPA_REDACTED },
    ];
    expect(scrubAssignees(erased, 'col1', 'Deleted collaborator')).toBeNull();
  });

  it('does not scrub user entries sharing the subject id', () => {
    expect(
      scrubAssignees([{ type: 'user', id: 'col1', name: 'Alice' }], 'col1', 'Deleted collaborator'),
    ).toBeNull();
  });
});
