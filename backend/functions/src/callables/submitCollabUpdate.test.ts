/**
 * Pure validation tests for submitCollabUpdate (#22, D-b): payload parsing
 * and collab-claims extraction. The write paths (task update + updates
 * entry + activity mirror) run in the emulator walkthrough.
 */

import { describe, expect, it } from 'vitest';

import {
  COLLAB_NOTE_MAX,
  COLLAB_REASON_MAX,
  collabClaimsOf,
  parseCollabUpdate,
} from './submitCollabUpdate.js';

describe('parseCollabUpdate', () => {
  it('accepts the two status targets', () => {
    expect(parseCollabUpdate({ kind: 'status', to: 'in_progress' })).toEqual({
      kind: 'status',
      to: 'in_progress',
    });
    expect(parseCollabUpdate({ kind: 'status', to: 'done' })).toEqual({
      kind: 'status',
      to: 'done',
    });
  });

  it('rejects statuses collaborators cannot set directly', () => {
    expect(parseCollabUpdate({ kind: 'status', to: 'todo' })).toBeNull();
    expect(parseCollabUpdate({ kind: 'status', to: 'blocked' })).toBeNull();
    expect(parseCollabUpdate({ kind: 'status' })).toBeNull();
  });

  it('accepts and trims need-help reasons within bounds (D-d)', () => {
    expect(parseCollabUpdate({ kind: 'need_help', reason: '  stuck on docs  ' })).toEqual({
      kind: 'need_help',
      reason: 'stuck on docs',
    });
    expect(
      parseCollabUpdate({ kind: 'need_help', reason: 'x'.repeat(COLLAB_REASON_MAX) }),
    ).not.toBeNull();
  });

  it('rejects empty and oversized reasons', () => {
    expect(parseCollabUpdate({ kind: 'need_help', reason: '   ' })).toBeNull();
    expect(
      parseCollabUpdate({ kind: 'need_help', reason: 'x'.repeat(COLLAB_REASON_MAX + 1) }),
    ).toBeNull();
    expect(parseCollabUpdate({ kind: 'need_help', reason: 42 })).toBeNull();
  });

  it('accepts and trims notes within bounds', () => {
    expect(parseCollabUpdate({ kind: 'note', text: ' progress update ' })).toEqual({
      kind: 'note',
      text: 'progress update',
    });
    expect(parseCollabUpdate({ kind: 'note', text: 'x'.repeat(COLLAB_NOTE_MAX) })).not.toBeNull();
  });

  it('rejects empty/oversized notes and unknown kinds', () => {
    expect(parseCollabUpdate({ kind: 'note', text: '' })).toBeNull();
    expect(parseCollabUpdate({ kind: 'note', text: 'x'.repeat(COLLAB_NOTE_MAX + 1) })).toBeNull();
    expect(parseCollabUpdate({ kind: 'delete_task' })).toBeNull();
    expect(parseCollabUpdate(null)).toBeNull();
    expect(parseCollabUpdate('note')).toBeNull();
  });
});

describe('collabClaimsOf', () => {
  const claims = { wid: 'w1', pid: 'p1', tid: 't1', colid: 'col1' };

  it('extracts well-formed collab claims', () => {
    expect(collabClaimsOf({ collab: claims })).toEqual(claims);
  });

  it('rejects missing, partial or empty claims', () => {
    expect(collabClaimsOf(undefined)).toBeNull();
    expect(collabClaimsOf({})).toBeNull();
    expect(collabClaimsOf({ collab: null })).toBeNull();
    expect(collabClaimsOf({ collab: { ...claims, colid: '' } })).toBeNull();
    expect(collabClaimsOf({ collab: { wid: 'w1', pid: 'p1', tid: 't1' } })).toBeNull();
    expect(collabClaimsOf({ portal: { wid: 'w1', pid: 'p1', cid: 'c1' } })).toBeNull();
  });
});
