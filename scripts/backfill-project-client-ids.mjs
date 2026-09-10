#!/usr/bin/env node
/**
 * One-off backfill (#157): populate `clientIds` + `clients` on every project
 * from its existing legacy single `clientId`/`clientNameDenorm`, so the portal
 * membership rules gate (`cid in clientIds`) and the firm multi-client UI have
 * the co-equal-clients fields on legacy projects.
 *
 * Run order (D5, no hard cutover): the new rules keep a defensive legacy
 * fallback, so this backfill can run BEFORE or AFTER the rules deploy. Running
 * it first is cleanest (every doc ends up with `clientIds`), but either order
 * is safe because unbackfilled docs still resolve via `clientId`.
 *
 * SAFE BY DEFAULT: prints the planned writes and a summary only. Pass
 * --execute to actually commit. Targets Application Default Credentials for a
 * real project, or the Firestore emulator when FIRESTORE_EMULATOR_HOST is set.
 *
 * Usage:
 *   node scripts/backfill-project-client-ids.mjs [--project=id] [--execute]
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfill-project-client-ids.mjs --execute
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Derives the multi-client `{ clientIds, clients }` projection from a project's
 * legacy single `clientId`/`clientNameDenorm` — pure so it unit-tests without
 * an admin app. An unlinked project (empty/absent clientId) yields empty
 * arrays (a valid, rules-passing state).
 */
export function clientFieldsFromLegacy(data) {
  const clientId = typeof data?.clientId === 'string' ? data.clientId : '';
  if (clientId === '') {
    return { clientIds: [], clients: [] };
  }
  const name = typeof data?.clientNameDenorm === 'string' ? data.clientNameDenorm : '';
  return { clientIds: [clientId], clients: [{ id: clientId, name }] };
}

/**
 * True when the doc already carries a `clientIds` array — the backfill is
 * idempotent and never overwrites docs that a form (dual-write) has already
 * populated, even if the legacy field later drifts.
 */
export function isBackfilled(data) {
  return Array.isArray(data?.clientIds);
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

  // Stream the collection-group scan so docs are processed incrementally: a
  // .get() would load every project into memory at once and can OOM on a large
  // production dataset. BulkWriter's own flow control throttles the writes.
  const stream = db.collectionGroup('projects').stream();
  let scanned = 0;
  let toWrite = 0;
  const writer = db.bulkWriter();

  for await (const projectDoc of stream) {
    // Only touch docs whose path is a real project (…/workspaces/{wid}/projects/{pid}).
    if (!/\/workspaces\/[^/]+\/projects\/[^/]+$/.test(projectDoc.ref.path)) {
      continue;
    }
    scanned += 1;
    const data = projectDoc.data();
    if (isBackfilled(data)) {
      continue;
    }
    const derived = clientFieldsFromLegacy(data);
    toWrite += 1;
    console.log(
      `${flags.execute ? 'WRITE' : 'PLAN '} ${projectDoc.ref.path} → ` +
        `clientIds=[${derived.clientIds.join(', ')}]`,
    );
    if (flags.execute) {
      void writer.set(projectDoc.ref, derived, { merge: true });
    }
  }

  if (flags.execute) {
    await writer.close();
  }
  console.log(
    `\n${flags.execute ? 'Backfill complete' : 'Dry run (pass --execute to commit)'}: ` +
      `${scanned} projects scanned, ${toWrite} ${flags.execute ? 'updated' : 'would update'}.`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
