/**
 * #171 message-log rules (PR A, H1 + D-025 minimal gate).
 *
 * Message docs carry live portal / collaborator bearer tokens
 * (`variables.portal_token` / `access_token`), so reads are limited to the
 * roles that already mint/copy those links: owner/admin read everything; pm
 * reads only docs whose denormalized `restrictedToDepartments` passes
 * `canSeeRestrictedList` (legacy docs without the field fail closed). Viewers,
 * other workspaces, portal/collab principals and a bare internal-admin token
 * are denied. Every client write stays denied.
 *
 * Also pins the four composite indexes in firestore.indexes.json against the
 * exact C2 query shapes (the emulator does not enforce indexes).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const DEP_FINANCE = 'dep-finance';
const DEP_SITE = 'dep-site';

const MESSAGES_A = `workspaces/${WKS_A}/messages`;
const MESSAGES_B = `workspaces/${WKS_B}/messages`;

const STATUS_DOC = 'msg-status';
const BLOCKED_FIN_DOC = 'msg-blocked-fin';
const COLLAB_DOC = 'msg-collab';
const NOT_SENT_DOC = 'msg-notsent';
const LEGACY_DOC = 'msg-legacy';
const QUOTA_DOC = 'quota90_wksA_2026-10';
const B_DOC = 'msg-b-client';

const ALL_A_DOCS = [STATUS_DOC, BLOCKED_FIN_DOC, COLLAB_DOC, NOT_SENT_DOC, LEGACY_DOC, QUOTA_DOC];
const UNRESTRICTED_A_DOCS = [STATUS_DOC, COLLAB_DOC, NOT_SENT_DOC];

let testEnv: RulesTestEnvironment;

/** The rules-unit-testing compat Firestore handle. */
type Firestore = ReturnType<
  ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']
>;

function baseMessage(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    channel: 'whatsapp',
    recipientPhone: '+60123456789',
    recipientType: 'client',
    recipientId: 'client1',
    templateName: 'task_status_change_v1',
    variables: {
      task_title: 'Pour slab',
      project_title: 'Bungalow Reno',
      firm_name: 'Acme Builders',
      new_status: 'in_progress',
      portal_token: 'abcdEFGH2345_c2VjcmV0',
    },
    status: 'sent',
    trigger: 'task_status_change',
    costEstimateMyr: 0.1,
    relatedTo: { type: 'task', id: 'task1' },
    createdAt: Timestamp.now(),
    restrictedToDepartments: [],
    ...extra,
  };
}

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-messages');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);

  await seedDoc(testEnv, `${MESSAGES_A}/${STATUS_DOC}`, baseMessage(STATUS_DOC));
  await seedDoc(
    testEnv,
    `${MESSAGES_A}/${BLOCKED_FIN_DOC}`,
    baseMessage(BLOCKED_FIN_DOC, {
      trigger: 'task_blocked',
      templateName: 'task_blocked_v1',
      variables: {
        task_title: 'Pour slab',
        project_title: 'Bungalow Reno',
        firm_name: 'Acme Builders',
        blocked_reason: 'Awaiting finance approval',
        portal_token: 'abcdEFGH2345_c2VjcmV0',
      },
      restrictedToDepartments: [DEP_FINANCE],
    }),
  );
  await seedDoc(
    testEnv,
    `${MESSAGES_A}/${COLLAB_DOC}`,
    baseMessage(COLLAB_DOC, {
      recipientType: 'collaborator',
      recipientId: 'col1',
      trigger: 'collab_access_link',
      templateName: 'siapp_collab_access_link_v1_en',
      variables: {
        firm_name: 'Acme Builders',
        collaborator_name: 'Lim Electrical',
        access_token: 'wxyzEFGH2345_dG9rZW4',
      },
      relatedTo: { type: 'collaborator', id: 'col1' },
    }),
  );
  await seedDoc(
    testEnv,
    `${MESSAGES_A}/${NOT_SENT_DOC}`,
    baseMessage(NOT_SENT_DOC, {
      trigger: 'project_welcome',
      templateName: 'siapp_project_welcome_v1_en',
      status: 'queued',
      suppressed: true,
      suppressedReason: 'no_consent',
      variables: {
        firm_name: 'Acme Builders',
        client_first_name: 'Ahmad',
        project_title: 'Bungalow Reno',
        project_due_date: '2026-07-15',
        portal_token: '',
      },
      relatedTo: { type: 'project', id: 'proj1' },
    }),
  );
  // Pre-#171 history: no restrictedToDepartments field at all.
  const legacy = baseMessage(LEGACY_DOC);
  delete legacy['restrictedToDepartments'];
  await seedDoc(testEnv, `${MESSAGES_A}/${LEGACY_DOC}`, legacy);
  // Member quota alert exactly as triggers/messageUsage.ts writes it today.
  const quota = baseMessage(QUOTA_DOC, {
    recipientType: 'member',
    recipientId: 'user-owner',
    trigger: 'wa_quota_90',
    templateName: 'wa_quota_90_v1',
    variables: { firmName: 'Acme Builders', used: '90', included: '100' },
    dedupeKey: QUOTA_DOC,
  });
  delete quota['relatedTo'];
  await seedDoc(testEnv, `${MESSAGES_A}/${QUOTA_DOC}`, quota);

  await seedDoc(testEnv, `${MESSAGES_B}/${B_DOC}`, baseMessage(B_DOC));
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A, departments: string[] = []): Firestore {
  return testEnv
    .authenticatedContext(`user-${role}-${departments.join('_')}`, {
      ...memberClaims(wid, role, departments),
    })
    .firestore();
}

function dbAsPortal(): Firestore {
  return testEnv
    .authenticatedContext(`portal_${WKS_A}_proj1_client1`, {
      portal: { wid: WKS_A, pid: 'proj1', cid: 'client1', linkId: 'link1' },
    })
    .firestore();
}

function dbAsCollab(): Firestore {
  return testEnv
    .authenticatedContext(`collab_${WKS_A}_col1`, {
      collab: { wid: WKS_A, colid: 'col1', linkId: 'link1' },
    })
    .firestore();
}

function dbAsInternalAdmin(): Firestore {
  return testEnv.authenticatedContext('siapp-admin', { isAdmin: true }).firestore();
}

function dbUnauth(): Firestore {
  return testEnv.unauthenticatedContext().firestore();
}

/**
 * Denied for the RIGHT reason: a clean `false`, not a rules evaluation error
 * (e.g. reading a missing token field), which would mask a broken guard.
 */
async function assertDeniedCleanly(promise: Promise<unknown>): Promise<void> {
  const error = (await assertFails(promise)) as { message?: string };
  expect(error.message ?? '').not.toMatch(
    /Property .* is undefined|Null value error|evaluation error/i,
  );
}

/** The C2 owner/admin query shapes (all / one type / one person). */
function ownerQueries(): Record<string, QueryConstraint[]> {
  return {
    'all types (in)': [
      where('recipientType', 'in', ['client', 'collaborator']),
      orderBy('createdAt', 'desc'),
      limit(50),
    ],
    'one type (==)': [
      where('recipientType', '==', 'client'),
      orderBy('createdAt', 'desc'),
      limit(50),
    ],
    'one person': [
      where('recipientType', '==', 'collaborator'),
      where('recipientId', '==', 'col1'),
      orderBy('createdAt', 'desc'),
      limit(50),
    ],
  };
}

/** The C2 pm query shapes: the owner shapes plus `restrictedToDepartments == []`. */
function pmQueries(): Record<string, QueryConstraint[]> {
  return {
    'dept only': [where('restrictedToDepartments', '==', []), orderBy('createdAt', 'desc')],
    'all types (in)': [
      where('recipientType', 'in', ['client', 'collaborator']),
      where('restrictedToDepartments', '==', []),
      orderBy('createdAt', 'desc'),
      limit(50),
    ],
    'one type (==)': [
      where('recipientType', '==', 'client'),
      where('restrictedToDepartments', '==', []),
      orderBy('createdAt', 'desc'),
      limit(50),
    ],
    'one person': [
      where('recipientType', '==', 'client'),
      where('recipientId', '==', 'client1'),
      where('restrictedToDepartments', '==', []),
      orderBy('createdAt', 'desc'),
      limit(50),
    ],
  };
}

describe('owner / admin message-log reads', () => {
  it('get succeeds on every doc, legacy and member quota included', async () => {
    for (const role of ['owner', 'admin'] as const) {
      for (const id of ALL_A_DOCS) {
        await assertSucceeds(getDoc(doc(dbAs(role), `${MESSAGES_A}/${id}`)));
      }
    }
  });

  it('an unconstrained list succeeds and returns every doc', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const snap = await assertSucceeds(getDocs(collection(dbAs(role), MESSAGES_A)));
      // seedWorkspace also seeds a bare `msg1`, so assert containment.
      expect(snap.docs.map((d) => d.id)).toEqual(expect.arrayContaining(ALL_A_DOCS));
    }
  });

  it('the C2 recipientType / recipientId + orderBy(createdAt) queries succeed', async () => {
    for (const role of ['owner', 'admin'] as const) {
      for (const constraints of Object.values(ownerQueries())) {
        await assertSucceeds(getDocs(query(collection(dbAs(role), MESSAGES_A), ...constraints)));
      }
    }
  });

  it('the pm-shaped query also works for owner/admin', async () => {
    for (const constraints of Object.values(pmQueries())) {
      await assertSucceeds(getDocs(query(collection(dbAs('owner'), MESSAGES_A), ...constraints)));
    }
  });
});

describe('pm without departments', () => {
  it('get succeeds on unrestricted docs (client, collaborator, not-sent, member quota)', async () => {
    for (const id of UNRESTRICTED_A_DOCS) {
      await assertSucceeds(getDoc(doc(dbAs('pm'), `${MESSAGES_A}/${id}`)));
    }
    await assertSucceeds(getDoc(doc(dbAs('pm'), `${MESSAGES_A}/${QUOTA_DOC}`)));
  });

  it('get is denied for the finance blocked doc and the legacy doc without a stamp', async () => {
    for (const id of [BLOCKED_FIN_DOC, LEGACY_DOC]) {
      await assertFails(getDoc(doc(dbAs('pm'), `${MESSAGES_A}/${id}`)));
    }
  });

  it('a pm in a different department is still denied the finance blocked doc', async () => {
    await assertFails(
      getDoc(doc(dbAs('pm', WKS_A, [DEP_SITE]), `${MESSAGES_A}/${BLOCKED_FIN_DOC}`)),
    );
  });

  it('list with restrictedToDepartments == [] succeeds (with / without type and person)', async () => {
    for (const [name, constraints] of Object.entries(pmQueries())) {
      const snap = await assertSucceeds(
        getDocs(query(collection(dbAs('pm'), MESSAGES_A), ...constraints)),
      );
      for (const d of snap.docs) {
        expect(d.get('restrictedToDepartments'), name).toEqual([]);
      }
    }
  });

  it('the pm "all" query returns exactly the unrestricted client/collaborator docs', async () => {
    const snap = await getDocs(
      query(collection(dbAs('pm'), MESSAGES_A), ...pmQueries()['all types (in)']),
    );
    expect(snap.docs.map((d) => d.id).sort()).toEqual([...UNRESTRICTED_A_DOCS].sort());
  });

  it('an unconstrained list is denied', async () => {
    await assertFails(getDocs(collection(dbAs('pm'), MESSAGES_A)));
  });

  it('the owner-shaped queries (no department filter) are denied', async () => {
    for (const constraints of Object.values(ownerQueries())) {
      await assertFails(getDocs(query(collection(dbAs('pm'), MESSAGES_A), ...constraints)));
    }
  });
});

describe('pm in finance', () => {
  it('get succeeds on the finance blocked doc', async () => {
    await assertSucceeds(
      getDoc(doc(dbAs('pm', WKS_A, [DEP_FINANCE]), `${MESSAGES_A}/${BLOCKED_FIN_DOC}`)),
    );
  });

  it('the follow-up per-department array-contains query is allowed by the rules', async () => {
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(dbAs('pm', WKS_A, [DEP_FINANCE]), MESSAGES_A),
          where('restrictedToDepartments', 'array-contains', DEP_FINANCE),
        ),
      ),
    );
    expect(snap.docs.map((d) => d.id)).toEqual([BLOCKED_FIN_DOC]);
  });

  it('still cannot read the legacy doc or list unconstrained', async () => {
    const db = dbAs('pm', WKS_A, [DEP_FINANCE]);
    await assertFails(getDoc(doc(db, `${MESSAGES_A}/${LEGACY_DOC}`)));
    await assertFails(getDocs(collection(db, MESSAGES_A)));
  });
});

describe('viewer', () => {
  it('get is denied on every doc, unrestricted included', async () => {
    for (const departments of [[], [DEP_FINANCE]]) {
      for (const id of ALL_A_DOCS) {
        await assertDeniedCleanly(
          getDoc(doc(dbAs('viewer', WKS_A, departments), `${MESSAGES_A}/${id}`)),
        );
      }
    }
  });

  it('list is denied, constrained or not', async () => {
    const db = dbAs('viewer');
    await assertDeniedCleanly(getDocs(collection(db, MESSAGES_A)));
    for (const constraints of [...Object.values(ownerQueries()), ...Object.values(pmQueries())]) {
      await assertDeniedCleanly(getDocs(query(collection(db, MESSAGES_A), ...constraints)));
    }
  });
});

describe('isolation and other principals', () => {
  const principals: [string, () => Firestore][] = [
    ['owner of wksB (cross-workspace)', () => dbAs('owner', WKS_B)],
    ['admin of wksB (cross-workspace)', () => dbAs('admin', WKS_B)],
    ['pm of wksB (cross-workspace)', () => dbAs('pm', WKS_B)],
    ['unauthenticated', dbUnauth],
    ['portal principal', dbAsPortal],
    ['collaborator principal', dbAsCollab],
    ['internal admin without a workspaces claim', dbAsInternalAdmin],
  ];

  it.each(principals)('%s: get denied on every wksA doc', async (_name, makeDb) => {
    for (const id of ALL_A_DOCS) {
      await assertDeniedCleanly(getDoc(doc(makeDb(), `${MESSAGES_A}/${id}`)));
    }
  });

  it.each(principals)('%s: list denied (unconstrained and pm-shaped)', async (_name, makeDb) => {
    await assertDeniedCleanly(getDocs(collection(makeDb(), MESSAGES_A)));
    await assertDeniedCleanly(
      getDocs(query(collection(makeDb(), MESSAGES_A), ...pmQueries()['all types (in)'])),
    );
  });

  it('a wksA owner cannot read the wksB message', async () => {
    await assertDeniedCleanly(getDoc(doc(dbAs('owner'), `${MESSAGES_B}/${B_DOC}`)));
    await assertDeniedCleanly(getDocs(collection(dbAs('owner'), MESSAGES_B)));
  });

  it('the wksB owner reads its own message (positive control)', async () => {
    await assertSucceeds(getDoc(doc(dbAs('owner', WKS_B), `${MESSAGES_B}/${B_DOC}`)));
  });
});

describe('writes are denied for every role', () => {
  const writers: [string, () => Firestore][] = [
    ['owner', () => dbAs('owner')],
    ['admin', () => dbAs('admin')],
    ['pm', () => dbAs('pm')],
    ['pm in finance', () => dbAs('pm', WKS_A, [DEP_FINANCE])],
    ['viewer', () => dbAs('viewer')],
    ['portal principal', dbAsPortal],
    ['collaborator principal', dbAsCollab],
    ['internal admin', dbAsInternalAdmin],
    ['unauthenticated', dbUnauth],
  ];

  it.each(writers)('%s: create / update / delete denied', async (_name, makeDb) => {
    const db = makeDb();
    await assertFails(setDoc(doc(db, `${MESSAGES_A}/msg-new`), baseMessage('msg-new')));
    await assertFails(updateDoc(doc(db, `${MESSAGES_A}/${STATUS_DOC}`), { status: 'read' }));
    await assertFails(updateDoc(doc(db, `${MESSAGES_A}/${NOT_SENT_DOC}`), { suppressed: false }));
    await assertFails(
      updateDoc(doc(db, `${MESSAGES_A}/${BLOCKED_FIN_DOC}`), { restrictedToDepartments: [] }),
    );
    await assertFails(deleteDoc(doc(db, `${MESSAGES_A}/${STATUS_DOC}`)));
  });
});

// ---------------------------------------------------------------------------
// Composite index coverage (A7). The emulator never requires indexes, so pin
// firestore.indexes.json against the exact C2 query shapes instead.
// ---------------------------------------------------------------------------

interface IIndexField {
  fieldPath: string;
  order?: 'ASCENDING' | 'DESCENDING';
  arrayConfig?: 'CONTAINS';
}

interface IIndex {
  collectionGroup: string;
  queryScope: string;
  fields: IIndexField[];
}

const INDEXES_PATH = fileURLToPath(new URL('../../../firestore.indexes.json', import.meta.url));
const indexes = (JSON.parse(readFileSync(INDEXES_PATH, 'utf8')) as { indexes: IIndex[] }).indexes;
const messageIndexes = indexes.filter((index) => index.collectionGroup === 'messages');

const ASC = (fieldPath: string): IIndexField => ({ fieldPath, order: 'ASCENDING' });
const CREATED_DESC: IIndexField = { fieldPath: 'createdAt', order: 'DESCENDING' };

/**
 * An `==` / `in` + `orderBy(createdAt desc)` query is served by a composite
 * index whose leading fields are exactly the equality fields (any order,
 * ASCENDING) followed by `createdAt DESCENDING`.
 */
function servingIndex(equalityFields: string[]): IIndex | undefined {
  return messageIndexes.find((index) => {
    if (index.queryScope !== 'COLLECTION') return false;
    if (index.fields.length !== equalityFields.length + 1) return false;
    const last = index.fields[index.fields.length - 1];
    if (last.fieldPath !== 'createdAt' || last.order !== 'DESCENDING') return false;
    const leading = index.fields.slice(0, -1);
    return (
      leading.every((field) => field.order === 'ASCENDING') &&
      [...leading.map((field) => field.fieldPath)].sort().join() ===
        [...equalityFields].sort().join()
    );
  });
}

describe('messages composite indexes (A7)', () => {
  it('declares exactly the four planned COLLECTION-scope indexes', () => {
    expect(messageIndexes).toEqual([
      {
        collectionGroup: 'messages',
        queryScope: 'COLLECTION',
        fields: [ASC('recipientType'), CREATED_DESC],
      },
      {
        collectionGroup: 'messages',
        queryScope: 'COLLECTION',
        fields: [ASC('recipientType'), ASC('recipientId'), CREATED_DESC],
      },
      {
        collectionGroup: 'messages',
        queryScope: 'COLLECTION',
        fields: [ASC('recipientType'), ASC('restrictedToDepartments'), CREATED_DESC],
      },
      {
        collectionGroup: 'messages',
        queryScope: 'COLLECTION',
        fields: [
          ASC('recipientType'),
          ASC('recipientId'),
          ASC('restrictedToDepartments'),
          CREATED_DESC,
        ],
      },
    ]);
  });

  it.each([
    ['owner/admin all or one type', ['recipientType']],
    ['owner/admin one person', ['recipientType', 'recipientId']],
    ['pm all or one type', ['recipientType', 'restrictedToDepartments']],
    ['pm one person', ['recipientType', 'recipientId', 'restrictedToDepartments']],
  ])('the C2 query "%s" has a serving index', (_name, equalityFields) => {
    expect(servingIndex(equalityFields)).toBeDefined();
  });

  it('no messages field override disables the single-field indexes the queries rely on', () => {
    const overrides =
      (
        JSON.parse(readFileSync(INDEXES_PATH, 'utf8')) as {
          fieldOverrides?: { collectionGroup: string }[];
        }
      ).fieldOverrides ?? [];
    expect(overrides.filter((override) => override.collectionGroup === 'messages')).toEqual([]);
  });

  it('existing non-messages composite indexes are preserved', () => {
    const groups = indexes.map((index) => index.collectionGroup);
    for (const group of ['activity', 'updates', 'documents', 'assignedTasks']) {
      expect(groups).toContain(group);
    }
  });
});
