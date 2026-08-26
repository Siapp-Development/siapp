/**
 * #127 collaborator storage rules: collab principals hold a WORKSPACE-scoped
 * token `{ wid, colid, linkId }` (no pid/tid — a collaborator can be assigned
 * tasks across projects). They read project objects, client-uploads/ (D-029
 * the other way: portal ↔ collab file sharing goes through metadata gates) and
 * collab-uploads/, and may create objects under collab-uploads/ only — ≤25 MB
 * with the COLLAB_ALLOWED_DOCUMENT_MIME_TYPES allowlist (parity asserted
 * below; includes zip). Reads are workspace-wide at the storage layer (per-
 * file assignee-membership + visibility is enforced at the Firestore metadata
 * layer, exercised in collab.test.ts) — the same tradeoff as firm-member
 * reads. Objects stay immutable; cross-WORKSPACE access and colid-less tokens
 * are denied fail-closed. Portal + firm reads of collab-uploads/ are covered
 * (D-029).
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { COLLAB_ALLOWED_DOCUMENT_MIME_TYPES, MAX_COLLAB_DOCUMENT_SIZE_BYTES } from '@siapp/shared';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createStorageTestEnv, memberClaims } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const PROJ = 'proj-collab';
const COL_ID = 'col1';
const COL_ID_OTHER = 'col2';
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

// #127: the redeemed collab token is workspace-scoped { wid, colid, linkId } —
// the deterministic uid is `collab_${wid}_${colid}` (see collabUid in
// portalTokens.ts). No pid/tid claim.
function storageAsCollab(wid: string = WKS_A, colid: string = COL_ID) {
  return testEnv
    .authenticatedContext(`collab_${wid}_${colid}`, {
      collab: { wid, colid, linkId: 'link1' },
    })
    .storage();
}

// A malformed collab token missing the colid claim — must fail closed.
function storageAsCollabNoColid(uid: string, wid: string = WKS_A) {
  return testEnv.authenticatedContext(uid, { collab: { wid, linkId: 'link1' } }).storage();
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

  // #127: the token is workspace-scoped (no pid), so reads are workspace-wide
  // at the storage layer; a collaborator with a different colid still resolves
  // the object here — per-file visibility is enforced at the Firestore layer.
  it('allows reads of objects in the same workspace (metadata gates per-file)', async () => {
    await assertSucceeds(
      storageAsCollab(WKS_A, COL_ID_OTHER).ref(FIRM_OBJECT).getDownloadURL(),
    );
    await assertSucceeds(
      storageAsCollab(WKS_A, COL_ID_OTHER).ref(COLLAB_OBJECT).getDownloadURL(),
    );
  });

  it('denies reads from another workspace', async () => {
    await assertFails(storageAsCollab(WKS_B).ref(FIRM_OBJECT).getDownloadURL());
    await assertFails(storageAsCollab(WKS_B).ref(COLLAB_OBJECT).getDownloadURL());
  });

  it('denies a collab token with no colid claim (fail-closed)', async () => {
    await assertFails(
      storageAsCollabNoColid('collab_wksA_nocolid_read').ref(FIRM_OBJECT).getDownloadURL(),
    );
    await assertFails(
      storageAsCollabNoColid('collab_wksA_nocolid_read').ref(COLLAB_OBJECT).getDownloadURL(),
    );
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

  it('explicitly allows image/vnd.dwg (.dwg) collab uploads (#129)', async () => {
    await assertSucceeds(
      put(storageAsCollab(), `${PROJECT_PREFIX}/collab-uploads/uuid-dwg`, PNG_BYTES, 'image/vnd.dwg'),
    );
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

  it('allows an assigned collaborator to upload with the new token shape', async () => {
    await assertSucceeds(
      put(
        storageAsCollab(),
        `${PROJECT_PREFIX}/collab-uploads/uuid-new-token.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
  });

  it('denies cross-workspace uploads', async () => {
    await assertFails(
      put(
        storageAsCollab(WKS_B),
        `${PROJECT_PREFIX}/collab-uploads/uuid-xwks.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
  });

  it('denies uploads from a collab token with no colid claim (fail-closed)', async () => {
    await assertFails(
      put(
        storageAsCollabNoColid('collab_wksA_nocolid_write'),
        `${PROJECT_PREFIX}/collab-uploads/uuid-nocolid.png`,
        PNG_BYTES,
        'image/png',
      ),
    );
  });

  it('denies deleting existing collab uploads (immutable)', async () => {
    await assertFails(Promise.resolve(storageAsCollab().ref(COLLAB_OBJECT).delete()));
  });
});
