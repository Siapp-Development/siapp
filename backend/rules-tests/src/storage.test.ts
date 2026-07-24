/**
 * #14 storage rules: firm uploads live under workspaces/{wid}/projects/{pid}/
 * — create for owner/admin/pm with a 25 MB cap and the shared mime allowlist
 * (parity with ALLOWED_DOCUMENT_MIME_TYPES asserted below); reads for any
 * workspace member; objects immutable (no overwrite/delete — removal is a
 * Firestore soft delete). client-uploads/ is member-readable, server-written.
 * Headline acceptance criterion: cross-workspace access denied.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from '@siapp/shared';
import type { TMemberRole } from '@siapp/shared';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createStorageTestEnv, memberClaims } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const PROJECT_PREFIX = `workspaces/${WKS_A}/projects/proj1`;
const SEEDED_PATH = `${PROJECT_PREFIX}/uuid-seeded.pdf`;
const CLIENT_UPLOAD_PATH = `${PROJECT_PREFIX}/client-uploads/uuid-client.pdf`;

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createStorageTestEnv('siapp-rules-storage');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(SEEDED_PATH).put(PDF_BYTES, { contentType: 'application/pdf' });
    await context
      .storage()
      .ref(CLIENT_UPLOAD_PATH)
      .put(PDF_BYTES, { contentType: 'application/pdf' });
  });
});

afterAll(async () => {
  await testEnv.clearStorage();
  await testEnv.cleanup();
});

function storageAs(role: TMemberRole, wid: string = WKS_A) {
  return testEnv.authenticatedContext(`user-${role}`, { ...memberClaims(wid, role) }).storage();
}

// The compat SDK's put() returns an UploadTask (thenable, not a Promise);
// wrap it so assertSucceeds/assertFails typecheck.
function put(
  storage: ReturnType<typeof storageAs>,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<unknown> {
  return Promise.resolve(storage.ref(path).put(bytes, { contentType }));
}

describe('storage reads', () => {
  it('allows every member role to read a project object', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertSucceeds(storageAs(role).ref(SEEDED_PATH).getDownloadURL());
    }
  });

  it('denies cross-workspace reads (acceptance criterion)', async () => {
    await assertFails(storageAs('owner', WKS_B).ref(SEEDED_PATH).getDownloadURL());
  });

  it('denies unauthenticated reads', async () => {
    await assertFails(
      testEnv.unauthenticatedContext().storage().ref(SEEDED_PATH).getDownloadURL(),
    );
  });

  it('allows members to read client-uploads objects', async () => {
    await assertSucceeds(storageAs('viewer').ref(CLIENT_UPLOAD_PATH).getDownloadURL());
  });
});

describe('storage uploads', () => {
  it('allows owner, admin and pm to upload a PDF', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        put(storageAs(role), `${PROJECT_PREFIX}/uuid-up-${role}.pdf`, PDF_BYTES, 'application/pdf'),
      );
    }
  });

  it('denies viewer uploads', async () => {
    await assertFails(
      put(storageAs('viewer'), `${PROJECT_PREFIX}/uuid-viewer.pdf`, PDF_BYTES, 'application/pdf'),
    );
  });

  it('denies cross-workspace uploads (acceptance criterion)', async () => {
    await assertFails(
      put(
        storageAs('owner', WKS_B),
        `${PROJECT_PREFIX}/uuid-cross.pdf`,
        PDF_BYTES,
        'application/pdf',
      ),
    );
  });

  it('accepts every entry of the shared mime allowlist (rules parity)', async () => {
    for (const [index, mimeType] of ALLOWED_DOCUMENT_MIME_TYPES.entries()) {
      await assertSucceeds(
        put(storageAs('owner'), `${PROJECT_PREFIX}/uuid-mime-${index}`, PDF_BYTES, mimeType),
      );
    }
  });

  it('denies disallowed content types (zip, svg)', async () => {
    for (const contentType of ['application/zip', 'image/svg+xml']) {
      await assertFails(
        put(storageAs('owner'), `${PROJECT_PREFIX}/uuid-bad-type`, PDF_BYTES, contentType),
      );
    }
  });

  it('denies uploads over the 25 MB cap', async () => {
    await assertFails(
      put(
        storageAs('owner'),
        `${PROJECT_PREFIX}/uuid-huge.pdf`,
        new Uint8Array(MAX_DOCUMENT_SIZE_BYTES + 1),
        'application/pdf',
      ),
    );
  });

  // Overwrite denial (`allow update: if false`) is not asserted here: the
  // Storage emulator evaluates uploads over an existing object as `create`,
  // so the test would pass against the wrong rule. Paths carry unguessable
  // uuids, and production evaluates overwrites as update → denied.

  it('denies deleting objects (soft delete lives in Firestore)', async () => {
    await assertFails(storageAs('owner').ref(SEEDED_PATH).delete());
  });

  it('denies writes outside the project prefix', async () => {
    await assertFails(
      put(storageAs('owner'), `workspaces/${WKS_A}/avatars/uuid-a.png`, PDF_BYTES, 'image/png'),
    );
    await assertFails(put(storageAs('owner'), 'loose-file.pdf', PDF_BYTES, 'application/pdf'));
  });

  it('denies client-uploads writes even for owner (server-side only)', async () => {
    await assertFails(
      put(
        storageAs('owner'),
        `${PROJECT_PREFIX}/client-uploads/uuid-x.pdf`,
        PDF_BYTES,
        'application/pdf',
      ),
    );
  });
});
