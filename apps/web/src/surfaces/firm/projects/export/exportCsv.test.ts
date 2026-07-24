/**
 * exportCsv (#25) — RFC-4180 quoting, BOM, per-entity serializers, and the
 * filename helper. Pure functions; downloadBlob is covered in the
 * ExportSection component tests with a mocked URL.createObjectURL.
 */

import { describe, expect, it } from 'vitest';

import type { IExportDocumentRecord, IExportTaskRecord, TExportRecord } from '@siapp/shared';

import {
  CSV_BOM,
  activityToCsv,
  csvField,
  documentsToCsv,
  exportFileName,
  tasksToCsv,
  updatesToCsv,
} from './exportCsv.ts';

function lines(csv: string): string[] {
  expect(csv.startsWith(CSV_BOM)).toBe(true);
  expect(csv.endsWith('\r\n')).toBe(true);
  return csv.slice(CSV_BOM.length, -2).split('\r\n');
}

describe('csvField (RFC-4180)', () => {
  it('passes plain values through unquoted', () => {
    expect(csvField('hello')).toBe('hello');
    expect(csvField(42)).toBe('42');
    expect(csvField(true)).toBe('true');
    expect(csvField('2026-07-01T00:00:00.000Z')).toBe('2026-07-01T00:00:00.000Z');
  });

  it('renders null/undefined as empty', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('quotes values containing commas', () => {
    expect(csvField('a, b')).toBe('"a, b"');
  });

  it('doubles inner quotes and wraps', () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes values containing newlines (LF and CRLF)', () => {
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('leaves unicode unquoted', () => {
    expect(csvField('École Syarikat Bina 建筑')).toBe('École Syarikat Bina 建筑');
  });

  it('joins arrays with a semicolon separator', () => {
    expect(csvField(['electrical', 'plumbing'])).toBe('electrical; plumbing');
  });
});

function task(overrides: Partial<IExportTaskRecord> = {}): IExportTaskRecord {
  return {
    id: 't1',
    title: 'Pour foundation',
    status: 'in_progress',
    phaseId: 'ph1',
    dueDate: '2026-08-01T00:00:00.000Z',
    order: 1,
    description: '',
    blockedReason: '',
    restrictedToDepartments: [],
    updates: [],
    ...overrides,
  };
}

describe('tasksToCsv', () => {
  it('emits a header-only file (with BOM) for an empty collection', () => {
    const rows = lines(tasksToCsv([]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^id,title,status/);
  });

  it('emits one row per task with ISO timestamps and escaped titles', () => {
    const rows = lines(
      tasksToCsv([
        task({
          title: 'Wire "main" panel, level 2',
          restrictedToDepartments: ['electrical'],
          updates: [{ id: 'u1' }, { id: 'u2' }],
        }),
      ]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"Wire ""main"" panel, level 2"');
    expect(rows[1]).toContain('2026-08-01T00:00:00.000Z');
    expect(rows[1]).toContain('electrical');
    expect(rows[1].endsWith(',2')).toBe(true); // updateCount
  });
});

describe('updatesToCsv', () => {
  it('flattens nested update streams to one row per update', () => {
    const rows = lines(
      updatesToCsv([
        task({
          updates: [
            {
              id: 'u1',
              action: 'comment',
              authorId: 'a1',
              authorNameDenorm: 'Alice',
              payload: { text: 'Multi\nline, "note"' },
              createdAt: '2026-07-01T02:00:00.000Z',
            },
          ],
        }),
        task({ id: 't2', updates: [] }),
      ]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].startsWith('t1,')).toBe(true);
    expect(rows[1]).toContain('"Multi\nline, ""note"""');
    expect(rows[1]).toContain('2026-07-01T02:00:00.000Z');
  });

  it('emits header-only when no task has updates', () => {
    expect(lines(updatesToCsv([task()]))).toHaveLength(1);
  });
});

describe('activityToCsv', () => {
  it('emits one row per entry with the at timestamp', () => {
    const entry: TExportRecord = {
      id: 'a1',
      action: 'task_status_changed',
      actorType: 'user',
      actorId: 'u1',
      actorNameDenorm: 'Alice',
      taskId: 't1',
      taskTitleDenorm: 'Pour foundation',
      visibleToClient: false,
      at: '2026-07-02T00:00:00.000Z',
    };
    const rows = lines(activityToCsv([entry]));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe(
      'a1,task_status_changed,user,u1,Alice,t1,Pour foundation,false,2026-07-02T00:00:00.000Z',
    );
  });

  it('emits header-only for empty activity', () => {
    expect(lines(activityToCsv([]))).toHaveLength(1);
  });
});

describe('documentsToCsv', () => {
  it('carries storagePath and the D6 deleted flag', () => {
    const doc: IExportDocumentRecord = {
      id: 'd1',
      deleted: true,
      name: 'site, "plan".pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1234,
      storagePath: 'workspaces/w1/projects/p1/documents/d1',
      scope: 'project',
      scopeId: 'p1',
      uploadedBy: 'u1',
      uploaderType: 'firm_member',
      uploadedAt: '2026-07-01T00:00:00.000Z',
      visibleToClient: false,
      scanStatus: 'clean',
      deletedAt: '2026-07-10T00:00:00.000Z',
    };
    const rows = lines(documentsToCsv([doc]));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"site, ""plan"".pdf"');
    expect(rows[1]).toContain('workspaces/w1/projects/p1/documents/d1');
    expect(rows[1]).toContain(',true,2026-07-10T00:00:00.000Z');
  });

  it('emits header-only for empty documents', () => {
    expect(lines(documentsToCsv([]))).toHaveLength(1);
  });
});

describe('exportFileName', () => {
  it('slugifies the project name', () => {
    expect(exportFileName('Bungalow Build — Phase 2!', 'export.json')).toBe(
      'bungalow-build-phase-2-export.json',
    );
  });

  it('falls back to "project" for empty/symbol-only names', () => {
    expect(exportFileName('', 'tasks.csv')).toBe('project-tasks.csv');
    expect(exportFileName('***', 'tasks.csv')).toBe('project-tasks.csv');
  });
});
