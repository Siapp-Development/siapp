#!/usr/bin/env node
/**
 * One-off backfill (#127): populate `assigneeCollaboratorIds` on every task
 * from its existing `assignees` object array, so the assignee-membership rules
 * gate and the assignedTasks mirror have a queryable field on legacy tasks.
 *
 * SAFE BY DEFAULT: prints the planned writes and a summary only. Pass
 * --execute to actually commit. Targets Application Default Credentials for a
 * real project, or the Firestore emulator when FIRESTORE_EMULATOR_HOST is set.
 *
 * Usage:
 *   node scripts/backfill-assignee-collaborator-ids.mjs [--project=id] [--execute]
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfill-assignee-collaborator-ids.mjs --execute
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Collaborator-type assignee ids from a task's `assignees` object array —
 * pure so it unit-tests without an admin app.
 */
export function collaboratorIdsFromAssignees(assignees) {
  if (!Array.isArray(assignees)) {
    return [];
  }
  const ids = [];
  for (const entry of assignees) {
    if (
      entry !== null &&
      typeof entry === 'object' &&
      entry.type === 'collaborator' &&
      typeof entry.id === 'string' &&
      entry.id !== '' &&
      !ids.includes(entry.id)
    ) {
      ids.push(entry.id);
    }
  }
  return ids;
}

/** True when the stored value already matches the derived projection. */
export function isUpToDate(current, derived) {
  return (
    Array.isArray(current) &&
    current.length === derived.length &&
    derived.every((id) => current.includes(id))
  );
}

function parseFlags(argv) {
  const flags = { project: process.env.GCLOUD_PROJECT ?? 'siapp-prod', execute: false };
  for (const arg of argv) {
    if (arg === '--execute') {
      flags.execute = true;
    } else {
      const match = /^--project=(.+)$/.exec(arg);
      if (match) {
        flags.project = match[1];
      } else {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const app = initializeApp({ projectId: flags.project });
  const db = getFirestore(app);

  // Collection-group scan over every task in every workspace/project.
  const tasks = await db.collectionGroup('tasks').get();
  let scanned = 0;
  let toWrite = 0;
  const writer = db.bulkWriter();

  for (const taskDoc of tasks.docs) {
    // Only touch docs whose path is a real task (…/projects/{pid}/tasks/{tid}).
    if (!/\/projects\/[^/]+\/tasks\/[^/]+$/.test(taskDoc.ref.path)) {
      continue;
    }
    scanned += 1;
    const data = taskDoc.data();
    const derived = collaboratorIdsFromAssignees(data.assignees);
    if (isUpToDate(data.assigneeCollaboratorIds, derived)) {
      continue;
    }
    toWrite += 1;
    console.log(
      `${flags.execute ? 'WRITE' : 'PLAN '} ${taskDoc.ref.path} → [${derived.join(', ')}]`,
    );
    if (flags.execute) {
      void writer.set(taskDoc.ref, { assigneeCollaboratorIds: derived }, { merge: true });
    }
  }

  if (flags.execute) {
    await writer.close();
  }
  console.log(
    `\n${flags.execute ? 'Backfill complete' : 'Dry run (pass --execute to commit)'}: ` +
      `${scanned} tasks scanned, ${toWrite} ${flags.execute ? 'updated' : 'would update'}.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
