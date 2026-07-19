#!/usr/bin/env node
/**
 * Dev-only seed for the local emulator suite (#9) — creates one workspace and
 * a signed-up firm user per role so the dashboard login flow is testable
 * before founder provisioning (#10) exists.
 *
 * Usage:
 *   1. Start the emulators (Auth + Firestore) in one terminal:
 *        pnpm exec firebase emulators:start --only auth,firestore
 *   2. In another terminal, run:
 *        node scripts/seed-auth-emulator.mjs
 *   3. Run the dashboard with emulators on:
 *        VITE_USE_EMULATORS=true pnpm --filter @siapp/web dev:dashboard
 *
 * Seeded accounts (password for all: "siapp-dev-password"):
 *   owner@siapp.test / admin@siapp.test / pm@siapp.test / viewer@siapp.test
 * Workspace: "Dev Workspace" at dashboard slug "dev".
 * Departments (#11): "Structural" (pm is a member) and "Interiors" (empty),
 * so need-to-know visibility and the D-004 reveal are testable out of the box.
 *
 * Talks straight to the emulators via the Admin SDK — NEVER run against
 * production (it refuses unless the emulator env vars are set).
 */

import process from 'node:process';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'siapp-prod';
const WORKSPACE_ID = 'dev-workspace';
const WORKSPACE_SLUG = 'dev';
const PASSWORD = 'siapp-dev-password';
const ROLES = ['owner', 'admin', 'pm', 'viewer'];
const DEPARTMENTS = [
  { id: 'dep-structural', name: 'Structural' },
  { id: 'dep-interiors', name: 'Interiors' },
];
// pm belongs to Structural — proves department-restricted reads for the others.
const MEMBER_DEPARTMENTS = { pm: ['dep-structural'] };

const app = initializeApp({ projectId: PROJECT_ID });
const auth = getAuth(app);
const db = getFirestore(app);

async function ensureUser(role) {
  const email = `${role}@siapp.test`;
  const displayName = `Dev ${role.charAt(0).toUpperCase()}${role.slice(1)}`;
  try {
    const existing = await auth.getUserByEmail(email);
    return { uid: existing.uid, email, displayName };
  } catch {
    const created = await auth.createUser({ email, password: PASSWORD, displayName });
    return { uid: created.uid, email, displayName };
  }
}

async function main() {
  const now = FieldValue.serverTimestamp();

  await db.doc(`workspaces/${WORKSPACE_ID}`).set({
    id: WORKSPACE_ID,
    name: 'Dev Workspace',
    slug: WORKSPACE_SLUG,
    ownerId: '',
    plan: 'trial',
    planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    seatLimit: 10,
    seatsUsed: ROLES.length,
    branding: {},
    whatsappAllowance: { includedPerPeriod: 0, periodStart: new Date(), used: 0 },
    defaultLocale: 'en',
    createdAt: now,
    updatedAt: now,
  });

  for (const role of ROLES) {
    const { uid, email, displayName } = await ensureUser(role);
    const departments = MEMBER_DEPARTMENTS[role] ?? [];

    // Member doc (doc id == uid, mirrored `uid` field — the claims trigger
    // queries collectionGroup('members').where('uid', '==', uid)).
    await db.doc(`workspaces/${WORKSPACE_ID}/members/${uid}`).set({
      uid,
      email,
      displayName,
      role,
      departments,
      seatActive: true,
      joinedAt: now,
      invitedBy: 'seed-script',
    });

    if (role === 'owner') {
      await db.doc(`workspaces/${WORKSPACE_ID}`).set({ ownerId: uid }, { merge: true });
    }

    // Set claims directly too, so the seed works even when the functions
    // emulator (which hosts syncMemberClaims) isn't running.
    await auth.setCustomUserClaims(uid, {
      workspaces: { [WORKSPACE_ID]: { role, departments } },
    });

    await db.doc(`users/${uid}`).set(
      {
        uid,
        email,
        displayName,
        locale: 'en',
        createdAt: now,
        lastSeenAt: now,
        claimsUpdatedAt: now,
      },
      { merge: true },
    );

    process.stdout.write(`seeded ${email} (${role}) uid=${uid}\n`);
  }

  for (const department of DEPARTMENTS) {
    const memberCount = Object.values(MEMBER_DEPARTMENTS).filter((deps) =>
      deps.includes(department.id),
    ).length;
    await db.doc(`workspaces/${WORKSPACE_ID}/departments/${department.id}`).set({
      id: department.id,
      name: department.name,
      createdAt: now,
      createdBy: 'seed-script',
      memberCount,
    });
    process.stdout.write(`seeded department ${department.name} (members: ${memberCount})\n`);
  }

  process.stdout.write(
    `\nDone. Sign in at the dashboard dev server with e.g. owner@siapp.test / ${PASSWORD}\n` +
      `Workspace slug: /${WORKSPACE_SLUG}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
