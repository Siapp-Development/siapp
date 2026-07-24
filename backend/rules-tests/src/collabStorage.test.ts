/**
 * #22 collaborator storage rules: collab principals read project objects,
 * client-uploads/ (D-029 the other way: portal ↔ collab file sharing goes
 * through metadata gates) and collab-uploads/, and may create objects under
 * collab-uploads/ only — ≤25 MB with the COLLAB_ALLOWED_DOCUMENT_MIME_TYPES
 * allowlist (parity asserted below; identical to the client list). Objects
 * stay immutable; cross-project/workspace access is denied. Portal + firm
 * reads of collab-uploads/ are covered (D-029).
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { COLLAB_ALLOWED_DOCUMENT_MIME_TYPES, MAX_COLLAB_DOCUMENT_SIZE_BYTES } from '@siapp/shared';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createStorageTestEnv, memberClaims } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const PROJ = 'proj-collab';
const PROJ_OTHER = 'proj-collab-other';
const TASK_ID = 'ctask1';
const COL_ID = 'col1';
const CLIENT_ID = 'client1';
const PROJECT_PREFIX = `workspaces/${WKS_A}/projects/${PROJ}`;
const FIRM_OBJECT = `${PROJECT_PREFIX}/uuid-firm-collab.pdf`;
const COLLAB_OBJECT = `${PROJECT_PREFIX}/collab-uploads/uuid-collab-seeded.pdf`;

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createStorageTestEnv('siapp-rules-collab-storage');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(FIRM_OBJECT).put(PDF_BYTES, { contentType: 'application/pdf' });
    await context
      .storage()
      .ref(COLLAB_OBJECT)
      .put(PDF_BYTES, { contentType: 'application/pdf' });
  });
});

afterAll(async () => {
  await testEnv.clearStorage();
  await testEnv.cleanup();
});

function storageAsCollab(pid: string = PROJ, wid: string = WKS_A) {
  return testEnv
    .authenticatedContext(`collab_${wid}_${TASK_ID}_${COL_ID}`, {
      collab: { wid, pid, tid: TASK_ID, colid: COL_ID, linkId: 'link1' },
    })
    .storage();
}

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
  storage: ReturnType<typeof storageAsCollab>,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<unknown> {
  return Promise.resolve(storage.ref(path).put(bytes, { contentType }));
}

describe('collab storage reads', () => {
  it('allows the collab principal to read project and collab-upload objects', async () => {
    await assertSucceeds(storageAsCollab().ref(FIRM_OBJECT).getDownloadURL());
    await assertSucceeds(storageAsCollab().ref(COLLAB_OBJECT).getDownloadURL());
  });

  it('denies reads scoped to another project or workspace', async () => {
    await assertFails(storageAsCollab(PROJ_OTHER).ref(FIRM_OBJECT).getDownloadURL());
    await assertFails(storageAsCollab(PROJ, WKS_B).ref(FIRM_OBJECT).getDownloadURL());
  });

  it('lets firm members and the portal client read collab uploads (D-029)', async () => {
    await assertSucceeds(storageAsMember().ref(COLLAB_OBJECT).getDownloadURL());
    await assertSucceeds(storageAsPortal().ref(COLLAB_OBJECT).getDownloadURL());
  });
});

describe('collab-upload creates', () => {
  it('allows every collab-allowlisted mime type (parity with @siapp/shared)', async () => {
    for (const [i, mime] of COLLAB_ALLOWED_DOCUMENT_MIME_TYPES.entries()) {
      await assertSucceeds(
        put(storageAsCollab(), `${PROJECT_PREFIX}/collab-uploads/uuid-mime-${i}`, PNG_BYTES, mime),
      );
    }
  });

  it('denies firm-only mime types (spreadsheets) for collab uploads', async () => {
    await assertFails(
      put(
        storageAsCollab(),
        `${PROJECT_PREFIX}/collab-uploads/uuid-xlsx`,
        PNG_BYTES,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    );
  });

  it('denies oversize uploads (>25 MB collab cap)', async () => {
    const oversize = new Uint8Array(MAX_COLLAB_DOCUMENT_SIZE_BYTES + 1);
    await assertFails(
      put(
        storageAsCollab(),
        `${PROJECT_PREFIX}/collab-uploads/uuid-big.png`,
        oversize,
        'image/png',
      ),
    );
  });

  it('denies collab writes outside collab-uploads/', async () => {
    await assertFails(
      put(storageAsCollab(), `${PROJECT_PREFIX}/uuid-escape.png`, PNG_BYTES, 'image/png'),
    );
    await assertFails(
      put(
        storageAsCollab(),
        `${PROJECT_PREFIX}/client-uploads/uuid-escape.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
  });

  it('denies portal principals writing to collab-uploads/', async () => {
    await assertFails(
      put(
        storageAsPortal(),
        `${PROJECT_PREFIX}/collab-uploads/uuid-portal.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
  });

  it('denies cross-project and cross-workspace uploads', async () => {
    await assertFails(
      put(
        storageAsCollab(PROJ_OTHER),
        `${PROJECT_PREFIX}/collab-uploads/uuid-xproj.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
    await assertFails(
      put(
        storageAsCollab(PROJ, WKS_B),
        `${PROJECT_PREFIX}/collab-uploads/uuid-xwks.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
  });

  it('denies deleting existing collab uploads (immutable)', async () => {
    await assertFails(Promise.resolve(storageAsCollab().ref(COLLAB_OBJECT).delete()));
  });
});
