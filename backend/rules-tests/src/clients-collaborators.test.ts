/**
 * #16 client + collaborator rules: reads for any member; create/update for
 * owner/admin/pm with strict key allowlists; phones must be E.164;
 * notificationsOptOut and lastTaskAt are SERVER-ONLY (absent from every
 * allowlist — firms can never set or clear an opt-out, D-035); no hard
 * deletes (collaborators archive via status; clients are edit-only).
 */

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
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const CLIENT_PATH = `workspaces/${WKS_A}/clients/client1`;
const COLLAB_PATH = `workspaces/${WKS_A}/collaborators/col1`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-clients-collaborators');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
});

beforeEach(async () => {
  await seedDoc(testEnv, CLIENT_PATH, validClient('client1'));
  await seedDoc(testEnv, COLLAB_PATH, validCollaborator('col1'));
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A) {
  return testEnv.authenticatedContext(`user-${role}`, { ...memberClaims(wid, role) }).firestore();
}

/** A client doc that passes the #16 create rule for `user-<role>` callers. */
function validClient(
  id: string,
  extra: Record<string, unknown> = {},
  creator = 'user-owner',
): Record<string, unknown> {
  return {
    id,
    name: 'Ahmad bin Ismail',
    phone: '+60123456789',
    language: 'en',
    createdAt: Timestamp.now(),
    createdBy: creator,
    ...extra,
  };
}

/** A collaborator doc that passes the #16 create rule for `user-<role>` callers. */
function validCollaborator(
  id: string,
  extra: Record<string, unknown> = {},
  creator = 'user-owner',
): Record<string, unknown> {
  return {
    id,
    name: 'Lim Electrical',
    phone: '+60198765432',
    type: 'company',
    status: 'active',
    createdAt: Timestamp.now(),
    invitedBy: creator,
    ...extra,
  };
}

describe('client + collaborator reads', () => {
  it('allows every member role to read both collections', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertSucceeds(getDoc(doc(dbAs(role), CLIENT_PATH)));
      await assertSucceeds(getDoc(doc(dbAs(role), COLLAB_PATH)));
    }
  });

  it('denies another workspace member reading or listing either collection', async () => {
    const foreign = dbAs('owner', WKS_B);
    await assertFails(getDoc(doc(foreign, CLIENT_PATH)));
    await assertFails(getDoc(doc(foreign, COLLAB_PATH)));
    await assertFails(getDocs(collection(foreign, `workspaces/${WKS_A}/clients`)));
    await assertFails(getDocs(collection(foreign, `workspaces/${WKS_A}/collaborators`)));
  });

  it('denies unauthenticated reads', async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, CLIENT_PATH)));
    await assertFails(getDoc(doc(anon, COLLAB_PATH)));
  });
});

describe('client create', () => {
  it('allows owner, admin and pm to create a valid client', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        setDoc(
          doc(dbAs(role), `workspaces/${WKS_A}/clients/client-${role}`),
          validClient(`client-${role}`, {}, `user-${role}`),
        ),
      );
    }
  });

  it('allows optional email, companyName and notes strings', async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm'), `workspaces/${WKS_A}/clients/client-full`),
        validClient('client-full', {
          email: 'ahmad@client.test',
          companyName: 'Ahmad Corp',
          notes: 'Prefers WhatsApp in the morning',
          language: 'ms',
        }, 'user-pm'),
      ),
    );
  });

  it('denies viewer, non-member and unauthenticated creates', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('viewer'), `workspaces/${WKS_A}/clients/client-v`),
        validClient('client-v', {}, 'user-viewer'),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner', WKS_B), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x'),
      ),
    );
    await assertFails(
      setDoc(
        doc(testEnv.unauthenticatedContext().firestore(), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x'),
      ),
    );
  });

  it('denies create with an extra key', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x', { magic: true }),
      ),
    );
  });

  it('denies create carrying notificationsOptOut — server-only (D-035)', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x', { notificationsOptOut: true }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x', { notificationsOptOut: false }),
      ),
    );
  });

  it('denies create with a non-E.164 phone', async () => {
    for (const phone of ['0123456789', '60123456789', '+0123456789', '+6012', 'not-a-phone', '']) {
      await assertFails(
        setDoc(
          doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
          validClient('client-x', { phone }),
        ),
      );
    }
  });

  it('denies create with an unsupported language', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x', { language: 'fr' }),
      ),
    );
  });

  it('denies create where createdBy is not the caller or id mismatches', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x', { createdBy: 'someone-else' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-other'),
      ),
    );
  });

  it('denies create with an empty or over-long name', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x', { name: '' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x', { name: 'x'.repeat(121) }),
      ),
    );
  });

  it('denies create with an over-long email or companyName', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x', { email: `${'x'.repeat(250)}@a.test` }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/clients/client-x`),
        validClient('client-x', { companyName: 'x'.repeat(121) }),
      ),
    );
  });
});

describe('client update', () => {
  it('allows owner, admin and pm to edit the client-editable fields', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        updateDoc(doc(dbAs(role), CLIENT_PATH), {
          name: `Renamed by ${role}`,
          phone: '+60111222333',
          language: 'ms',
        }),
      );
    }
  });

  it('denies viewer updates', async () => {
    await assertFails(updateDoc(doc(dbAs('viewer'), CLIENT_PATH), { name: 'Hacked' }));
  });

  it('denies a diff touching createdBy, createdAt or id', async () => {
    // Values must differ from the seeded doc — writing an unchanged value
    // produces no diff key and is (correctly) allowed.
    await assertFails(updateDoc(doc(dbAs('owner'), CLIENT_PATH), { createdBy: 'user-intruder' }));
    await assertFails(updateDoc(doc(dbAs('owner'), CLIENT_PATH), { createdAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(dbAs('owner'), CLIENT_PATH), { id: 'client-other' }));
  });

  it('denies setting or clearing notificationsOptOut for every role (D-035)', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      // Setting the flag on a doc that doesn't have it…
      await seedDoc(testEnv, CLIENT_PATH, validClient('client1'));
      await assertFails(
        updateDoc(doc(dbAs(role), CLIENT_PATH), { notificationsOptOut: true }),
      );
      // …and clearing a server-set opt-out are both denied.
      await seedDoc(testEnv, CLIENT_PATH, validClient('client1', { notificationsOptOut: true }));
      await assertFails(
        updateDoc(doc(dbAs(role), CLIENT_PATH), { notificationsOptOut: false }),
      );
    }
  });

  it('allows editing other fields while a server-set opt-out is present', async () => {
    await seedDoc(testEnv, CLIENT_PATH, validClient('client1', { notificationsOptOut: true }));
    await assertSucceeds(updateDoc(doc(dbAs('pm'), CLIENT_PATH), { name: 'Ahmad (updated)' }));
  });

  it('denies an update with an invalid phone', async () => {
    await assertFails(updateDoc(doc(dbAs('owner'), CLIENT_PATH), { phone: '0123' }));
  });

  it('denies delete for every role', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertFails(deleteDoc(doc(dbAs(role), CLIENT_PATH)));
    }
  });
});

describe('collaborator create', () => {
  it('allows owner, admin and pm to create an active collaborator', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        setDoc(
          doc(dbAs(role), `workspaces/${WKS_A}/collaborators/col-${role}`),
          validCollaborator(`col-${role}`, {}, `user-${role}`),
        ),
      );
    }
  });

  it('allows optional email, company and trade strings', async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAs('pm'), `workspaces/${WKS_A}/collaborators/col-full`),
        validCollaborator('col-full', {
          email: 'lim@sub.test',
          company: 'Lim Electrical Sdn Bhd',
          trade: 'Electrical',
          type: 'individual',
        }, 'user-pm'),
      ),
    );
  });

  it('denies viewer creating collaborators', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('viewer'), `workspaces/${WKS_A}/collaborators/col-v`),
        validCollaborator('col-v', {}, 'user-viewer'),
      ),
    );
  });

  it('denies create with status archived', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/collaborators/col-x`),
        validCollaborator('col-x', { status: 'archived' }),
      ),
    );
  });

  it('denies create carrying lastTaskAt or notificationsOptOut — server-only', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/collaborators/col-x`),
        validCollaborator('col-x', { lastTaskAt: Timestamp.now() }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/collaborators/col-x`),
        validCollaborator('col-x', { notificationsOptOut: true }),
      ),
    );
  });

  it('denies create where invitedBy is not the caller', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/collaborators/col-x`),
        validCollaborator('col-x', { invitedBy: 'someone-else' }),
      ),
    );
  });

  it('denies create with a bad type or phone', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/collaborators/col-x`),
        validCollaborator('col-x', { type: 'robot' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/collaborators/col-x`),
        validCollaborator('col-x', { phone: '0123456789' }),
      ),
    );
  });

  it('denies create with an over-long email, company or trade', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/collaborators/col-x`),
        validCollaborator('col-x', { email: `${'x'.repeat(250)}@a.test` }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/collaborators/col-x`),
        validCollaborator('col-x', { company: 'x'.repeat(121) }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/collaborators/col-x`),
        validCollaborator('col-x', { trade: 'x'.repeat(121) }),
      ),
    );
  });
});

describe('collaborator update', () => {
  it('allows owner, admin and pm to edit fields and archive', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        updateDoc(doc(dbAs(role), COLLAB_PATH), {
          trade: 'Wiring',
          status: 'archived',
        }),
      );
    }
  });

  it('allows unarchiving back to active', async () => {
    await seedDoc(testEnv, COLLAB_PATH, validCollaborator('col1', { status: 'archived' }));
    await assertSucceeds(updateDoc(doc(dbAs('owner'), COLLAB_PATH), { status: 'active' }));
  });

  it('denies viewer updates', async () => {
    await assertFails(updateDoc(doc(dbAs('viewer'), COLLAB_PATH), { status: 'archived' }));
  });

  it('denies a diff touching invitedBy, createdAt, id, lastTaskAt or notificationsOptOut', async () => {
    // Values must differ from the seeded doc — writing an unchanged value
    // produces no diff key and is (correctly) allowed.
    await assertFails(updateDoc(doc(dbAs('owner'), COLLAB_PATH), { invitedBy: 'user-intruder' }));
    await assertFails(updateDoc(doc(dbAs('owner'), COLLAB_PATH), { createdAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(dbAs('owner'), COLLAB_PATH), { id: 'col-other' }));
    await assertFails(updateDoc(doc(dbAs('owner'), COLLAB_PATH), { lastTaskAt: Timestamp.now() }));
    await assertFails(
      updateDoc(doc(dbAs('owner'), COLLAB_PATH), { notificationsOptOut: false }),
    );
  });

  it('allows edits while server-set lastTaskAt and opt-out are present', async () => {
    await seedDoc(
      testEnv,
      COLLAB_PATH,
      validCollaborator('col1', { lastTaskAt: Timestamp.now(), notificationsOptOut: true }),
    );
    await assertSucceeds(updateDoc(doc(dbAs('pm'), COLLAB_PATH), { name: 'Lim (updated)' }));
  });

  it('denies an update with an invalid status value', async () => {
    await assertFails(updateDoc(doc(dbAs('owner'), COLLAB_PATH), { status: 'deleted' }));
  });

  it('denies delete for every role', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertFails(deleteDoc(doc(dbAs(role), COLLAB_PATH)));
    }
  });
});
