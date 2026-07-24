/**
 * Shared harness for Firestore security-rules tests.
 *
 * Runs against the local Firestore emulator (started by
 * `firebase emulators:exec` — see the root `test:rules` script). Auth is
 * simulated via `authenticatedContext(uid, claims)` using the same
 * `IWorkspaceClaims` shape the future `setCustomClaim` function will write.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc } from 'firebase/firestore';
import type { IWorkspaceClaims, TMemberRole } from '@siapp/shared';

const RULES_PATH = fileURLToPath(new URL('../../../firestore.rules', import.meta.url));
const STORAGE_RULES_PATH = fileURLToPath(new URL('../../../storage.rules', import.meta.url));

function emulatorHost(): { host: string; port: number } {
  // Set automatically by `firebase emulators:exec`; fall back to the
  // firebase.json default (port 8080) for a manually started emulator.
  const fromEnv = process.env.FIRESTORE_EMULATOR_HOST;
  if (fromEnv) {
    const [host, port] = fromEnv.split(':');
    return { host, port: Number(port) };
  }
  return { host: '127.0.0.1', port: 8080 };
}

function storageEmulatorHost(): { host: string; port: number } {
  const fromEnv = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (fromEnv) {
    const [host, port] = fromEnv.split(':');
    return { host, port: Number(port) };
  }
  return { host: '127.0.0.1', port: 9199 };
}

/**
 * One test environment per test file. Pass a unique `projectId` per file so
 * parallel files don't share emulator state.
 */
export async function createTestEnv(projectId: string): Promise<RulesTestEnvironment> {
  const { host, port } = emulatorHost();
  return initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port,
      rules: readFileSync(RULES_PATH, 'utf8'),
    },
  });
}

/** Storage-rules variant of createTestEnv (#14) — boots against storage.rules. */
export async function createStorageTestEnv(projectId: string): Promise<RulesTestEnvironment> {
  const { host, port } = storageEmulatorHost();
  return initializeTestEnvironment({
    projectId,
    storage: {
      host,
      port,
      rules: readFileSync(STORAGE_RULES_PATH, 'utf8'),
    },
  });
}

/** Custom-claims payload for a member of a single workspace. */
export function memberClaims(
  wid: string,
  role: TMemberRole = 'pm',
  departments: string[] = [],
): IWorkspaceClaims {
  return { workspaces: { [wid]: { role, departments } } };
}

/**
 * Representative document path for every collection the rules cover,
 * parameterized by workspace id.
 */
export function workspacePaths(wid: string): Record<string, string> {
  return {
    workspace: `workspaces/${wid}`,
    member: `workspaces/${wid}/members/member1`,
    invite: `workspaces/${wid}/invites/inv1`,
    department: `workspaces/${wid}/departments/dep1`,
    client: `workspaces/${wid}/clients/client1`,
    collaborator: `workspaces/${wid}/collaborators/col1`,
    project: `workspaces/${wid}/projects/proj1`,
    phase: `workspaces/${wid}/projects/proj1/phases/phase1`,
    task: `workspaces/${wid}/projects/proj1/tasks/task1`,
    taskUpdate: `workspaces/${wid}/projects/proj1/tasks/task1/updates/upd1`,
    document: `workspaces/${wid}/projects/proj1/documents/doc1`,
    milestone: `workspaces/${wid}/projects/proj1/milestones/mile1`,
    magicLink: `workspaces/${wid}/magicLinks/a8K2pQ`,
    message: `workspaces/${wid}/messages/msg1`,
    auditLog: `workspaces/${wid}/auditLog/audit1`,
    usageCounter: `workspaces/${wid}/usageCounters/2026-07`,
  };
}

/** Seed a minimal doc at every path of `workspacePaths(wid)`, bypassing rules. */
export async function seedWorkspace(testEnv: RulesTestEnvironment, wid: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const path of Object.values(workspacePaths(wid))) {
      await setDoc(doc(db, path), { seededFor: wid });
    }
  });
}

/** Seed an arbitrary document path with the given data, bypassing rules. */
export async function seedDoc(
  testEnv: RulesTestEnvironment,
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

/** Seed a `/users/{uid}` profile doc, bypassing rules. */
export async function seedUser(testEnv: RulesTestEnvironment, uid: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${uid}`), { uid });
  });
}

/** A users/{uid} payload that satisfies the #9 profile validation rules. */
export function validProfilePayload(uid: string, email: string): Record<string, unknown> {
  return {
    uid,
    email,
    displayName: 'Test Member',
    locale: 'en',
    createdAt: Timestamp.now(),
    lastSeenAt: Timestamp.now(),
  };
}

/** Seed a fully valid `/users/{uid}` profile doc, bypassing rules. */
export async function seedUserProfile(
  testEnv: RulesTestEnvironment,
  uid: string,
  email: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${uid}`), {
      ...validProfilePayload(uid, email),
      ...extra,
    });
  });
}
