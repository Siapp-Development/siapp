/**
 * #12 project rules: reads for any member; field CRUD for owner/admin/pm with
 * a strict allow-list; `lifecycle` + its timestamps, `summary`, and
 * provenance/denorm fields are client-immutable (transitions via the
 * setProjectLifecycle callable, summary via the onTaskWrite trigger);
 * completed/archived/deleted projects are read-only; delete is denied
 * outright (soft delete only, D-027).
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import {
  Timestamp,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const PROJ_PATH = `workspaces/${WKS_A}/projects/proj-site`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-projects');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
});

beforeEach(async () => {
  await seedDoc(testEnv, PROJ_PATH, validProject('proj-site'));
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A) {
  return testEnv.authenticatedContext(`user-${role}`, { ...memberClaims(wid, role) }).firestore();
}

/** A task doc that passes the #13 create rule for `user-<role>` callers. */
function validTask(
  id: string,
  creator: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    title: 'Pour foundation',
    status: 'todo',
    assignees: [],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    dependsOn: [],
    order: 1,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: creator,
    ...extra,
  };
}

/** A project doc that passes the #12 create rule for `user-<role>` callers. */
function validProject(
  id: string,
  extra: Record<string, unknown> = {},
  creator = 'user-owner',
): Record<string, unknown> {
  return {
    id,
    name: 'Site renovation',
    vertical: 'construction',
    lifecycle: 'draft',
    status: 'planning',
    clientId: '',
    clientNameDenorm: '',
    ownerUid: creator,
    ownerNameDenorm: 'Test Owner',
    startDate: Timestamp.now(),
    summary: { totalTasks: 0, doneTasks: 0, overdueTasks: 0, progressPct: 0 },
    visibility: { clientCanSee: true, collaboratorsCount: 0 },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: creator,
    ...extra,
  };
}

describe('project reads', () => {
  it('allows every member role to read a project', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertSucceeds(getDoc(doc(dbAs(role), PROJ_PATH)));
    }
  });

  it('denies another workspace member reading projects', async () => {
    await assertFails(getDoc(doc(dbAs('owner', WKS_B), PROJ_PATH)));
  });
});

describe('project create', () => {
  it('allows owner, admin and pm to create a valid draft project', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        setDoc(
          doc(dbAs(role), `workspaces/${WKS_A}/projects/proj-${role}`),
          validProject(`proj-${role}`, {}, `user-${role}`),
        ),
      );
    }
  });

  it('denies viewer creating projects', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('viewer'), `workspaces/${WKS_A}/projects/proj-v`),
        validProject('proj-v', {}, 'user-viewer'),
      ),
    );
  });

  it('denies create with a non-draft lifecycle', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', { lifecycle: 'published' }),
      ),
    );
  });

  it('denies create with nonzero summary counters', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', {
          summary: { totalTasks: 3, doneTasks: 1, overdueTasks: 0, progressPct: 33 },
        }),
      ),
    );
  });

  it('denies create with a nonzero collaboratorsCount', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', { visibility: { clientCanSee: true, collaboratorsCount: 2 } }),
      ),
    );
  });

  it('denies create with extra keys inside summary or visibility', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', {
          summary: {
            totalTasks: 0,
            doneTasks: 0,
            overdueTasks: 0,
            progressPct: 0,
            lastActivityAt: Timestamp.now(),
          },
        }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', {
          visibility: { clientCanSee: true, collaboratorsCount: 0, hiddenFromClient: true },
        }),
      ),
    );
  });

  it('denies create where createdBy or ownerUid is not the caller', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('admin'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', { createdBy: 'someone-else' }, 'user-admin'),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('admin'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', { ownerUid: 'someone-else' }, 'user-admin'),
      ),
    );
  });

  it('denies create with an id mismatching the doc id', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('other-id'),
      ),
    );
  });

  it('denies create with an invalid vertical, status, or extra keys', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', { vertical: 'crypto' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', { status: 'nope' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', { publishedAt: Timestamp.now() }),
      ),
    );
  });

  it('denies create with an empty or over-long name', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', { name: '' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x', { name: 'x'.repeat(121) }),
      ),
    );
  });

  it('denies cross-workspace create even for an owner', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner', WKS_B), `workspaces/${WKS_A}/projects/proj-x`),
        validProject('proj-x'),
      ),
    );
  });
});

describe('project update', () => {
  it('allows owner, admin and pm to edit fields on a draft project', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        updateDoc(doc(dbAs(role), PROJ_PATH), {
          name: `Renamed by ${role}`,
          status: 'active',
          updatedAt: Timestamp.now(),
        }),
      );
    }
  });

  it('allows editing a published project', async () => {
    await seedDoc(testEnv, PROJ_PATH, validProject('proj-site', { lifecycle: 'published' }));
    await assertSucceeds(
      updateDoc(doc(dbAs('pm'), PROJ_PATH), { name: 'Live edit', updatedAt: Timestamp.now() }),
    );
  });

  it('denies viewer updates', async () => {
    await assertFails(
      updateDoc(doc(dbAs('viewer'), PROJ_PATH), { name: 'Hacked', updatedAt: Timestamp.now() }),
    );
  });

  it('denies edits to completed, archived, and deleted projects', async () => {
    for (const lifecycle of ['completed', 'archived', 'deleted'] as const) {
      await seedDoc(testEnv, PROJ_PATH, validProject('proj-site', { lifecycle }));
      await assertFails(
        updateDoc(doc(dbAs('owner'), PROJ_PATH), { name: 'Nope', updatedAt: Timestamp.now() }),
      );
    }
  });

  it('denies mutating lifecycle from the client for every role', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertFails(
        updateDoc(doc(dbAs(role), PROJ_PATH), {
          lifecycle: 'published',
          updatedAt: Timestamp.now(),
        }),
      );
    }
  });

  it('denies mutating summary or lifecycle timestamps', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), PROJ_PATH), {
        summary: { totalTasks: 9, doneTasks: 9, overdueTasks: 0, progressPct: 100 },
        updatedAt: Timestamp.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(dbAs('owner'), PROJ_PATH), {
        publishedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('denies tampering with provenance and identity fields', async () => {
    const tampering: Array<Record<string, unknown>> = [
      { id: 'renamed' },
      { vertical: 'legal' },
      { ownerUid: 'user-admin' },
      { ownerNameDenorm: 'Impostor' },
      { createdAt: Timestamp.now() },
      { createdBy: 'user-admin' },
    ];
    for (const patch of tampering) {
      await assertFails(
        updateDoc(doc(dbAs('owner'), PROJ_PATH), { ...patch, updatedAt: Timestamp.now() }),
      );
    }
  });

  it('denies changing collaboratorsCount via a visibility update', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), PROJ_PATH), {
        visibility: { clientCanSee: false, collaboratorsCount: 4 },
        updatedAt: Timestamp.now(),
      }),
    );
    // The legitimate toggle keeps the count unchanged.
    await assertSucceeds(
      updateDoc(doc(dbAs('owner'), PROJ_PATH), {
        visibility: { clientCanSee: false, collaboratorsCount: 0 },
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('denies injecting extra keys into visibility on update', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), PROJ_PATH), {
        visibility: { clientCanSee: false, collaboratorsCount: 0, portalTheme: 'dark' },
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('denies removing the visibility map on update', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), PROJ_PATH), {
        visibility: deleteField(),
        updatedAt: Timestamp.now(),
      }),
    );
  });
});

describe('project delete', () => {
  it('denies delete for every role (soft delete via callable only)', async () => {
    for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
      await assertFails(deleteDoc(doc(dbAs(role), PROJ_PATH)));
    }
  });
});

// #15 duplicate project (D-031): provenance is create-only and the copy is a
// plain batched client write — the same rules as manual creation apply, so a
// caller can never copy a task they couldn't see.
describe('project duplicate (#15)', () => {
  it('allows owner, admin and pm to create with duplicatedFromProjectId', async () => {
    for (const role of ['owner', 'admin', 'pm'] as const) {
      await assertSucceeds(
        setDoc(
          doc(dbAs(role), `workspaces/${WKS_A}/projects/copy-${role}`),
          validProject(`copy-${role}`, { duplicatedFromProjectId: 'proj-site' }, `user-${role}`),
        ),
      );
    }
  });

  it('denies create with a non-string or empty duplicatedFromProjectId', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/copy-x`),
        validProject('copy-x', { duplicatedFromProjectId: 123 }),
      ),
    );
    await assertFails(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/copy-x`),
        validProject('copy-x', { duplicatedFromProjectId: '' }),
      ),
    );
  });

  it('denies introducing duplicatedFromProjectId on update (immutable)', async () => {
    await assertFails(
      updateDoc(doc(dbAs('owner'), PROJ_PATH), {
        duplicatedFromProjectId: 'proj-other',
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('denies modifying or removing duplicatedFromProjectId on an existing copy', async () => {
    const copyPath = `workspaces/${WKS_A}/projects/proj-copy`;
    await seedDoc(
      testEnv,
      copyPath,
      validProject('proj-copy', { duplicatedFromProjectId: 'proj-site' }),
    );
    await assertFails(
      updateDoc(doc(dbAs('owner'), copyPath), {
        duplicatedFromProjectId: 'proj-other',
        updatedAt: Timestamp.now(),
      }),
    );
    await assertFails(
      updateDoc(doc(dbAs('owner'), copyPath), {
        duplicatedFromProjectId: deleteField(),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('allows a duplicate-shaped batch: project + task copies by the caller', async () => {
    const db = dbAs('pm');
    const batch = writeBatch(db);
    batch.set(
      doc(db, `workspaces/${WKS_A}/projects/batch-copy`),
      validProject('batch-copy', { duplicatedFromProjectId: 'proj-site' }, 'user-pm'),
    );
    batch.set(
      doc(db, `workspaces/${WKS_A}/projects/batch-copy/tasks/task-copy`),
      validTask('task-copy', 'user-pm'),
    );
    await assertSucceeds(batch.commit());
  });

  it('denies a batch whose task copy is restricted to a department the pm lacks', async () => {
    const db = dbAs('pm');
    const batch = writeBatch(db);
    batch.set(
      doc(db, `workspaces/${WKS_A}/projects/batch-blocked`),
      validProject('batch-blocked', { duplicatedFromProjectId: 'proj-site' }, 'user-pm'),
    );
    batch.set(
      doc(db, `workspaces/${WKS_A}/projects/batch-blocked/tasks/task-fin`),
      validTask('task-fin', 'user-pm', { restrictedToDepartments: ['dep-finance'] }),
    );
    await assertFails(batch.commit());
  });
});
