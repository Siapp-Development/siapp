import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_DATABASE,
  DEFAULT_PROJECT,
  buildCommand,
  formatCommand,
  parseArgs,
} from './firestore-backup.mjs';

describe('parseArgs', () => {
  it('defaults to siapp-prod, (default) database, and dry-run', () => {
    const { command, flags } = parseArgs(['enable-pitr']);

    assert.equal(command, 'enable-pitr');
    assert.equal(flags.project, DEFAULT_PROJECT);
    assert.equal(flags.database, DEFAULT_DATABASE);
    assert.equal(flags.execute, false);
  });

  it('parses flag overrides and --execute', () => {
    const { flags } = parseArgs([
      'restore',
      '--project=other-proj',
      '--backup=projects/p/locations/l/backups/b',
      '--target-db=drill-20260724',
      '--execute',
    ]);

    assert.equal(flags.project, 'other-proj');
    assert.equal(flags.backup, 'projects/p/locations/l/backups/b');
    assert.equal(flags.targetDb, 'drill-20260724');
    assert.equal(flags.execute, true);
  });

  it('rejects unknown commands', () => {
    assert.throws(() => parseArgs(['nuke-everything']), /Unknown command/);
  });

  it('rejects unknown flags', () => {
    assert.throws(() => parseArgs(['enable-pitr', '--frobnicate=yes']), /Unrecognized argument/);
  });
});

describe('buildCommand', () => {
  const defaults = { project: DEFAULT_PROJECT, database: DEFAULT_DATABASE, execute: false };

  it('builds the exact enable-pitr command', () => {
    assert.deepEqual(buildCommand('enable-pitr', defaults), [
      'gcloud',
      'firestore',
      'databases',
      'update',
      '--database=(default)',
      '--enable-pitr',
      '--project=siapp-prod',
    ]);
  });

  it('builds the exact daily 14-week create-schedule command (D5)', () => {
    assert.deepEqual(buildCommand('create-schedule', defaults), [
      'gcloud',
      'firestore',
      'backups',
      'schedules',
      'create',
      '--database=(default)',
      '--recurrence=daily',
      '--retention=14w',
      '--project=siapp-prod',
    ]);
  });

  it('builds list-schedules and list-backups commands', () => {
    assert.deepEqual(buildCommand('list-schedules', defaults), [
      'gcloud',
      'firestore',
      'backups',
      'schedules',
      'list',
      '--database=(default)',
      '--project=siapp-prod',
    ]);
    assert.deepEqual(buildCommand('list-backups', { ...defaults, location: 'asia-southeast1' }), [
      'gcloud',
      'firestore',
      'backups',
      'list',
      '--location=asia-southeast1',
      '--project=siapp-prod',
    ]);
  });

  it('builds the restore command against a new database', () => {
    assert.deepEqual(
      buildCommand('restore', {
        ...defaults,
        backup: 'projects/siapp-prod/locations/asia-southeast1/backups/abc',
        targetDb: 'drill-20260724',
      }),
      [
        'gcloud',
        'firestore',
        'databases',
        'restore',
        '--source-backup=projects/siapp-prod/locations/asia-southeast1/backups/abc',
        '--destination-database=drill-20260724',
        '--project=siapp-prod',
      ],
    );
  });

  it('refuses to restore without --backup and --target-db', () => {
    assert.throws(() => buildCommand('restore', defaults), /restore requires/);
  });

  it('refuses to restore over the (default) database', () => {
    assert.throws(
      () => buildCommand('restore', { ...defaults, backup: 'b', targetDb: '(default)' }),
      /never \(default\)/,
    );
  });
});

describe('formatCommand', () => {
  it('quotes the (default) database id for shell copy-paste', () => {
    const formatted = formatCommand(['gcloud', '--database=(default)', '--project=siapp-prod']);

    assert.equal(formatted, "gcloud '--database=(default)' --project=siapp-prod");
  });
});
