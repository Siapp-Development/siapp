/**
 * Pure-function tests for exportProject (#25): claims gate (owner/admin
 * only), serializeExport (Timestamp→ISO at depth, ordering, nested updates,
 * D6 deleted flag) and the D1 size guard. Firestore assembly + the D5 audit
 * write run in the emulator walkthrough. No assertWorkspaceActive test is
 * needed — the callable never imports it (D4, asserted below by module
 * inspection at review; a read_only workspace cannot throw a gate error that
 * is never called).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  EXPORT_VERSION,
  assertExportSize,
  requireOwnerAdminClaims,
  serializeExport,
  toIsoDeep,
  type IExportSource,
} from './exportProject.js';

function fakeTimestamp(iso: string): { toDate: () => Date } {
  return { toDate: () => new Date(iso) };
}

function authFor(role: string | undefined, workspaceId = 'w1') {
  return {
    uid: 'u1',
    token: role === undefined ? {} : { workspaces: { [workspaceId]: { role } } },
  };
}

describe('requireOwnerAdminClaims', () => {
  it('rejects unauthenticated callers', () => {
    expect(() => requireOwnerAdminClaims(undefined, 'w1')).toThrowError(/Sign in/);
    expect(() => requireOwnerAdminClaims({ token: {} }, 'w1')).toThrowError(/Sign in/);
  });

  it('rejects viewer and pm roles (stricter than the editor checks)', () => {
    expect(() => requireOwnerAdminClaims(authFor('viewer'), 'w1')).toThrowError(
      /owner or an admin/,
    );
    expect(() => requireOwnerAdminClaims(authFor('pm'), 'w1')).toThrowError(/owner or an admin/);
  });

  it('rejects callers with no claim entry for the workspace', () => {
    expect(() => requireOwnerAdminClaims(authFor(undefined), 'w1')).toThrowError(
      /owner or an admin/,
    );
    // Owner of a *different* workspace — multi-tenant isolation.
    expect(() => requireOwnerAdminClaims(authFor('owner', 'w2'), 'w1')).toThrowError(
      /owner or an admin/,
    );
  });

  it('passes owner and admin and returns the uid', () => {
    expect(requireOwnerAdminClaims(authFor('owner'), 'w1')).toBe('u1');
    expect(requireOwnerAdminClaims(authFor('admin'), 'w1')).toBe('u1');
  });
});

describe('toIsoDeep', () => {
  it('converts timestamps at every depth, leaving scalars alone', () => {
    const input = {
      at: fakeTimestamp('2026-07-01T02:00:00.000Z'),
      nested: { dueDate: fakeTimestamp('2026-07-02T00:00:00.000Z'), n: 3, s: 'x', b: true },
      list: [fakeTimestamp('2026-07-03T00:00:00.000Z'), 'plain', null],
      empty: null,
    };
    expect(toIsoDeep(input)).toEqual({
      at: '2026-07-01T02:00:00.000Z',
      nested: { dueDate: '2026-07-02T00:00:00.000Z', n: 3, s: 'x', b: true },
      list: ['2026-07-03T00:00:00.000Z', 'plain', null],
      empty: null,
    });
  });
});

function baseSource(overrides: Partial<IExportSource> = {}): IExportSource {
  return {
    workspaceId: 'w1',
    projectId: 'p1',
    exportedAt: new Date('2026-07-24T08:00:00.000Z'),
    project: { id: 'p1', data: { name: 'Bungalow', createdAt: fakeTimestamp('2026-06-01T00:00:00.000Z') } },
    phases: [],
    milestones: [],
    tasks: [],
    activity: [],
    documents: [],
    ...overrides,
  };
}

describe('serializeExport', () => {
  it('emits the versioned envelope with ISO timestamps', () => {
    const payload = serializeExport(baseSource());
    expect(payload.exportVersion).toBe(EXPORT_VERSION);
    expect(payload.exportedAt).toBe('2026-07-24T08:00:00.000Z');
    expect(payload.workspaceId).toBe('w1');
    expect(payload.projectId).toBe('p1');
    expect(payload.project).toEqual({
      id: 'p1',
      name: 'Bungalow',
      createdAt: '2026-06-01T00:00:00.000Z',
    });
    expect(payload.tasks).toEqual([]);
    expect(payload.documents).toEqual([]);
  });

  it('orders tasks by `order` and nests their updates by createdAt asc', () => {
    const payload = serializeExport(
      baseSource({
        tasks: [
          {
            id: 't2',
            data: { title: 'Second', order: 2 },
            updates: [
              { id: 'uB', data: { text: 'later', createdAt: fakeTimestamp('2026-07-02T00:00:00Z') } },
              { id: 'uA', data: { text: 'first', createdAt: fakeTimestamp('2026-07-01T00:00:00Z') } },
            ],
          },
          { id: 't1', data: { title: 'First', order: 1 }, updates: [] },
        ],
      }),
    );
    expect(payload.tasks.map((task) => task['title'])).toEqual(['First', 'Second']);
    expect(payload.tasks[1].updates.map((update) => update['text'])).toEqual(['first', 'later']);
    expect(payload.tasks[1].updates[0]['createdAt']).toBe('2026-07-01T00:00:00.000Z');
  });

  it('retains restrictedToDepartments on tasks (faithful export)', () => {
    const payload = serializeExport(
      baseSource({
        tasks: [
          { id: 't1', data: { title: 'Wiring', restrictedToDepartments: ['electrical'] }, updates: [] },
        ],
      }),
    );
    expect(payload.tasks[0]['restrictedToDepartments']).toEqual(['electrical']);
  });

  it('orders activity by `at` desc', () => {
    const payload = serializeExport(
      baseSource({
        activity: [
          { id: 'a1', data: { action: 'older', at: fakeTimestamp('2026-07-01T00:00:00Z') } },
          { id: 'a2', data: { action: 'newer', at: fakeTimestamp('2026-07-02T00:00:00Z') } },
        ],
      }),
    );
    expect(payload.activity.map((entry) => entry['action'])).toEqual(['newer', 'older']);
  });

  it('flags soft-deleted documents and passes their fields through (D6)', () => {
    const payload = serializeExport(
      baseSource({
        documents: [
          {
            id: 'd1',
            data: {
              name: 'plan.pdf',
              storagePath: 'workspaces/w1/projects/p1/documents/d1',
              deletedAt: fakeTimestamp('2026-07-10T00:00:00Z'),
              scanStatus: 'clean',
            },
          },
          { id: 'd2', data: { name: 'live.pdf', deletedAt: null } },
        ],
      }),
    );
    expect(payload.documents[0]).toMatchObject({
      id: 'd1',
      deleted: true,
      deletedAt: '2026-07-10T00:00:00.000Z',
      storagePath: 'workspaces/w1/projects/p1/documents/d1',
    });
    expect(payload.documents[1]).toMatchObject({ id: 'd2', deleted: false });
  });

  it('tolerates unknown/legacy fields and deterministically breaks order ties by id', () => {
    const payload = serializeExport(
      baseSource({
        phases: [
          { id: 'phB', data: { name: 'B', order: 1, legacyField: { weird: true } } },
          { id: 'phA', data: { name: 'A', order: 1 } },
        ],
      }),
    );
    expect(payload.phases.map((phase) => phase.id)).toEqual(['phA', 'phB']);
    expect(payload.phases[1]['legacyField']).toEqual({ weird: true });
  });
});

describe('assertExportSize (D1 guard)', () => {
  it('passes payloads under the limit', () => {
    expect(() => assertExportSize({ small: true }, 1024)).not.toThrow();
  });

  it('throws resource-exhausted over the limit', () => {
    expect(() => assertExportSize({ big: 'x'.repeat(2048) }, 1024)).toThrowError(/too large/);
  });
});

describe('D4 — no workspace-status gate', () => {
  it('never imports assertWorkspaceActive (read-only workspaces can export)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./exportProject.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/assertWorkspaceActive\(/);
  });
});
