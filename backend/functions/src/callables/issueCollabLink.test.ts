/**
 * Pure gate tests for issueCollabLink (#22, E1): assignment/visibility
 * checks, the issue blocker matrix, and issuer need-to-know. The mint +
 * revoke-previous path runs in the emulator walkthrough.
 */

import { describe, expect, it } from 'vitest';

import {
  collabIssueBlocker,
  isCollaboratorAssignee,
  issuerCanSeeTask,
  passesCollabVisibility,
  type ICollabIssueGateInput,
} from './issueCollabLink.js';

const ASSIGNEES = [
  { type: 'user', id: 'u1' },
  { type: 'collaborator', id: 'col1' },
];

function validInput(overrides: Partial<ICollabIssueGateInput> = {}): ICollabIssueGateInput {
  return {
    projectExists: true,
    lifecycle: 'published',
    taskExists: true,
    assignees: ASSIGNEES,
    visibleToCollaboratorIds: [],
    collaboratorId: 'col1',
    ...overrides,
  };
}

describe('isCollaboratorAssignee', () => {
  it('matches only collaborator-type entries with the id', () => {
    expect(isCollaboratorAssignee(ASSIGNEES, 'col1')).toBe(true);
    expect(isCollaboratorAssignee(ASSIGNEES, 'u1')).toBe(false);
    expect(isCollaboratorAssignee(ASSIGNEES, 'col2')).toBe(false);
  });

  it('tolerates malformed assignees fields', () => {
    expect(isCollaboratorAssignee(undefined, 'col1')).toBe(false);
    expect(isCollaboratorAssignee('nope', 'col1')).toBe(false);
    expect(isCollaboratorAssignee([null, 42, {}], 'col1')).toBe(false);
  });
});

describe('passesCollabVisibility', () => {
  it('treats a missing or empty list as visible to all assignees', () => {
    expect(passesCollabVisibility(undefined, 'col1')).toBe(true);
    expect(passesCollabVisibility([], 'col1')).toBe(true);
  });

  it('enforces membership when the list is non-empty', () => {
    expect(passesCollabVisibility(['col1'], 'col1')).toBe(true);
    expect(passesCollabVisibility(['col2'], 'col1')).toBe(false);
  });
});

describe('collabIssueBlocker', () => {
  it('passes a collaborator assignee on a published project', () => {
    expect(collabIssueBlocker(validInput())).toBeNull();
    expect(collabIssueBlocker(validInput({ lifecycle: 'completed' }))).toBeNull();
    expect(
      collabIssueBlocker(validInput({ visibleToCollaboratorIds: ['col1'] })),
    ).toBeNull();
  });

  it('blocks missing projects and non-live lifecycles (D-027)', () => {
    expect(collabIssueBlocker(validInput({ projectExists: false }))).toBe('not-found');
    expect(collabIssueBlocker(validInput({ lifecycle: 'draft' }))).toBe('not-published');
    expect(collabIssueBlocker(validInput({ lifecycle: 'archived' }))).toBe('not-published');
    expect(collabIssueBlocker(validInput({ lifecycle: undefined }))).toBe('not-published');
  });

  it('blocks missing tasks, non-assignees and hidden collaborators', () => {
    expect(collabIssueBlocker(validInput({ taskExists: false }))).toBe('task-not-found');
    expect(collabIssueBlocker(validInput({ collaboratorId: 'col9' }))).toBe('not-assigned');
    expect(
      collabIssueBlocker(validInput({ visibleToCollaboratorIds: ['col2'] })),
    ).toBe('not-visible');
  });
});

describe('issuerCanSeeTask', () => {
  it('always passes owner and admin', () => {
    expect(issuerCanSeeTask('owner', [], ['tax'])).toBe(true);
    expect(issuerCanSeeTask('admin', [], ['tax'])).toBe(true);
  });

  it('requires department overlap for pm on restricted tasks', () => {
    expect(issuerCanSeeTask('pm', ['tax'], ['tax', 'audit'])).toBe(true);
    expect(issuerCanSeeTask('pm', ['payroll'], ['tax'])).toBe(false);
  });

  it('passes pm on unrestricted or malformed restriction lists', () => {
    expect(issuerCanSeeTask('pm', [], [])).toBe(true);
    expect(issuerCanSeeTask('pm', [], undefined)).toBe(true);
    expect(issuerCanSeeTask('pm', [], 'oops')).toBe(true);
  });
});
