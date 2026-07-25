/**
 * #21 portal storage rules: portal principals read project objects and
 * client-uploads/, and may create objects under client-uploads/ only —
 * ≤10 MB with the tighter CLIENT_ALLOWED_DOCUMENT_MIME_TYPES allowlist
 * (parity asserted below). Objects stay immutable; cross-project and
 * cross-workspace access is denied. Firm behaviour is regression-checked.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { CLIENT_ALLOWED_DOCUMENT_MIME_TYPES, MAX_CLIENT_DOCUMENT_SIZE_BYTES } from '@siapp/shared';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createStorageTestEnv, memberClaims } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const PROJ = 'proj-portal';
const PROJ_OTHER = 'proj-portal-other';
const CLIENT_ID = 'client1';
const PROJECT_PREFIX = `workspaces/${WKS_A}/projects/${PROJ}`;
const FIRM_OBJECT = `${PROJECT_PREFIX}/uuid-firm.pdf`;
const CLIENT_OBJECT = `${PROJECT_PREFIX}/client-uploads/uuid-client-seeded.png`;

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createStorageTestEnv('siapp-rules-portal-storage');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(FIRM_OBJECT).put(PDF_BYTES, { contentType: 'application/pdf' });
    await context.storage().ref(CLIENT_OBJECT).put(PNG_BYTES, { contentType: 'image/png' });
  });
});

afterAll(async () => {
  await testEnv.clearStorage();
  await testEnv.cleanup();
});

function storageAsPortal(pid: string = PROJ, wid: string = WKS_A) {
  return testEnv
    .authenticatedContext(`portal_${wid}_${pid}_${CLIENT_ID}`, {
      portal: { wid, pid, cid: CLIENT_ID, linkId: 'link1' },
    })
    .storage();
}

function storageAsMember(role: 'owner' | 'viewer' = 'viewer', wid: string = WKS_A) {
  return testEnv.authenticatedContext(`user-${role}`, { ...memberClaims(wid, role) }).storage();
}

// The compat SDK's put() returns an UploadTask (thenable, not a Promise);
// wrap it so assertSucceeds/assertFails typecheck.
function put(
  storage: ReturnType<typeof storageAsPortal>,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<unknown> {
  return Promise.resolve(storage.ref(path).put(bytes, { contentType }));
}

describe('portal storage reads', () => {
  it('allows the portal principal to read project and client-upload objects', async () => {
    await assertSucceeds(storageAsPortal().ref(FIRM_OBJECT).getDownloadURL());
    await assertSucceeds(storageAsPortal().ref(CLIENT_OBJECT).getDownloadURL());
  });

  it('denies reads scoped to another project or workspace', async () => {
    await assertFails(storageAsPortal(PROJ_OTHER).ref(FIRM_OBJECT).getDownloadURL());
    await assertFails(storageAsPortal(PROJ, WKS_B).ref(FIRM_OBJECT).getDownloadURL());
  });

  it('still lets firm members read client uploads (regression)', async () => {
    await assertSucceeds(storageAsMember().ref(CLIENT_OBJECT).getDownloadURL());
  });
});

describe('portal client-upload creates', () => {
  it('allows every client-allowlisted mime type (parity with @siapp/shared)', async () => {
    for (const [i, mime] of CLIENT_ALLOWED_DOCUMENT_MIME_TYPES.entries()) {
      await assertSucceeds(
        put(
          storageAsPortal(),
          `${PROJECT_PREFIX}/client-uploads/uuid-mime-${i}`,
          PNG_BYTES,
          mime,
        ),
      );
    }
  });

  it('denies firm-only mime types (spreadsheets) for client uploads', async () => {
    await assertFails(
      put(
        storageAsPortal(),
        `${PROJECT_PREFIX}/client-uploads/uuid-xlsx`,
        PNG_BYTES,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    );
  });

  it('denies oversize uploads (>10 MB client cap)', async () => {
    const oversize = new Uint8Array(MAX_CLIENT_DOCUMENT_SIZE_BYTES + 1);
    await assertFails(
      put(storageAsPortal(), `${PROJECT_PREFIX}/client-uploads/uuid-big.png`, oversize, 'image/png'),
    );
  });

  it('denies portal writes outside client-uploads/', async () => {
    await assertFails(
      put(storageAsPortal(), `${PROJECT_PREFIX}/uuid-escape.png`, PNG_BYTES, 'image/png'),
    );
  });

  it('denies cross-project and cross-workspace uploads', async () => {
    await assertFails(
      put(
        storageAsPortal(PROJ_OTHER),
        `${PROJECT_PREFIX}/client-uploads/uuid-crossp.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
    await assertFails(
      put(
        storageAsPortal(PROJ, WKS_B),
        `${PROJECT_PREFIX}/client-uploads/uuid-crossw.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
  });

  // Overwrite denial (`allow update: if false`) is not asserted here: the
  // Storage emulator evaluates overwrites as create (same caveat as
  // storage.test.ts); production evaluates them as update → denied.
  it('denies deleting existing client uploads (immutable)', async () => {
    await assertFails(Promise.resolve(storageAsPortal().ref(CLIENT_OBJECT).delete()));
  });

  it('denies firm-member writes to client-uploads/ (portal-only path)', async () => {
    await assertFails(
      put(
        storageAsMember('owner'),
        `${PROJECT_PREFIX}/client-uploads/uuid-firm-write.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
  });

  it('denies unauthenticated uploads', async () => {
    await assertFails(
      put(
        testEnv.unauthenticatedContext().storage(),
        `${PROJECT_PREFIX}/client-uploads/uuid-anon.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
  });
});
