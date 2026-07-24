#!/usr/bin/env node
/**
 * Firestore backup / PITR helper (#27, D5). Wraps the exact gcloud commands
 * for enabling point-in-time recovery, managing the daily native backup
 * schedule, and running the quarterly restore drill — so the runbook and CI
 * never drift from what actually runs.
 *
 * SAFE BY DEFAULT: every subcommand only PRINTS the gcloud command. Pass
 * --execute to actually run it (requires gcloud auth + datastore.owner on
 * the target project — Part B, see plans/runbook-observability.md).
 *
 * Usage:
 *   node scripts/firestore-backup.mjs enable-pitr      [--project=id] [--database=id] [--execute]
 *   node scripts/firestore-backup.mjs create-schedule  [--recurrence=daily] [--retention=14w] [--execute]
 *   node scripts/firestore-backup.mjs list-schedules   [--execute]
 *   node scripts/firestore-backup.mjs list-backups     [--location=asia-southeast1] [--execute]
 *   node scripts/firestore-backup.mjs restore --backup=<full-backup-name> --target-db=<new-db-id> [--execute]
 *
 * `restore` always targets a NEW database id — the drill never touches
 * `(default)`. Delete drill databases afterwards to stop billing.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PROJECT = 'siapp-prod';
export const DEFAULT_DATABASE = '(default)';

const COMMANDS = ['enable-pitr', 'create-schedule', 'list-schedules', 'list-backups', 'restore'];

const FLAG_KEYS = {
  project: 'project',
  database: 'database',
  recurrence: 'recurrence',
  retention: 'retention',
  location: 'location',
  backup: 'backup',
  'target-db': 'targetDb',
};

/**
 * Parses `argv` (everything after the script path) into a command + flags.
 * Throws on unknown commands or flags so typos never silently no-op.
 */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) {
    throw new Error(
      `Unknown command: ${command ?? '(none)'}. Expected one of: ${COMMANDS.join(', ')}.`,
    );
  }

  const flags = { project: DEFAULT_PROJECT, database: DEFAULT_DATABASE, execute: false };
  for (const arg of rest) {
    if (arg === '--execute') {
      flags.execute = true;
      continue;
    }
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    const key = match === null ? undefined : FLAG_KEYS[match[1]];
    if (key === undefined) {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
    flags[key] = match[2];
  }
  return { command, flags };
}

/** Builds the exact gcloud argv for a subcommand. Pure — no side effects. */
export function buildCommand(command, flags) {
  const project = `--project=${flags.project}`;
  const database = `--database=${flags.database}`;

  switch (command) {
    case 'enable-pitr':
      return ['gcloud', 'firestore', 'databases', 'update', database, '--enable-pitr', project];
    case 'create-schedule':
      return [
        'gcloud',
        'firestore',
        'backups',
        'schedules',
        'create',
        database,
        `--recurrence=${flags.recurrence ?? 'daily'}`,
        `--retention=${flags.retention ?? '14w'}`,
        project,
      ];
    case 'list-schedules':
      return ['gcloud', 'firestore', 'backups', 'schedules', 'list', database, project];
    case 'list-backups':
      return [
        'gcloud',
        'firestore',
        'backups',
        'list',
        ...(flags.location !== undefined ? [`--location=${flags.location}`] : []),
        project,
      ];
    case 'restore':
      if (flags.backup === undefined || flags.targetDb === undefined) {
        throw new Error('restore requires --backup=<full-backup-name> and --target-db=<new-db-id>');
      }
      if (flags.targetDb === DEFAULT_DATABASE || flags.targetDb === 'default') {
        throw new Error('restore must target a NEW database id, never (default)');
      }
      return [
        'gcloud',
        'firestore',
        'databases',
        'restore',
        `--source-backup=${flags.backup}`,
        `--destination-database=${flags.targetDb}`,
        project,
      ];
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

/** Quotes argv parts containing shell-special characters for display. */
export function formatCommand(argv) {
  return argv.map((part) => (/[()\s]/.test(part) ? `'${part}'` : part)).join(' ');
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`✖ ${error.message}`);
    process.exit(2);
  }

  let argv;
  try {
    argv = buildCommand(parsed.command, parsed.flags);
  } catch (error) {
    console.error(`✖ ${error.message}`);
    process.exit(2);
  }

  if (!parsed.flags.execute) {
    console.log(formatCommand(argv));
    console.log('(dry run — add --execute to run this command)');
    return;
  }

  const result = spawnSync(argv[0], argv.slice(1), { stdio: 'inherit' });
  if (result.error) {
    console.error(`✖ Failed to run gcloud: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
