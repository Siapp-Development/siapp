/**
 * #111 (D-041) tag rules: the two workspace tag registries — `projectTags` and
 * `taskTags` — share the same `validTag()` shape and owner/admin/pm CRUD; the
 * pools are independent but rule-identical. Also covers the `tags` array now
 * allowlisted on project/task create+update (list, size <= 20). Verifies
 * cross-workspace isolation and the `workspaceActive` write gate.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { TMemberRole } from '@siapp/shared';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createTestEnv, memberClaims, seedDoc, seedWorkspace } from './helpers.ts';

const WKS_A = 'wksA';
const WKS_B = 'wksB';
const WKS_RO = 'wksRO'; // read-only (billing-suspended) workspace.

const PROJ_PATH = `workspaces/${WKS_A}/projects/proj-site`;
const TASK_PATH = `workspaces/${WKS_A}/projects/proj-site/tasks/task1`;

/** Both tag registries share the SAME rule; run the whole suite against each. */
const REGISTRIES = ['projectTags', 'taskTags'] as const;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv('siapp-rules-tags');
  await seedWorkspace(testEnv, WKS_A);
  await seedWorkspace(testEnv, WKS_B);
  await seedDoc(testEnv, `workspaces/${WKS_RO}`, { seededFor: WKS_RO, billingStatus: 'read_only' });
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbAs(role: TMemberRole, wid: string = WKS_A) {
  return testEnv.authenticatedContext(`user-${role}`, { ...memberClaims(wid, role) }).firestore();
}

/** A tag doc that passes `validTag()` for a `user-<role>` caller. */
function validTag(
  id: string,
  creator = 'user-owner',
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: 'High Priority',
    normalizedName: 'high priority',
    color: 'amber',
    createdAt: Timestamp.now(),
    createdBy: creator,
    updatedAt: Timestamp.now(),
    updatedBy: creator,
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

/** A task doc that passes the #13 create rule for `user-<role>` callers. */
function validTask(
  id: string,
  extra: Record<string, unknown> = {},
  creator = 'user-owner',
): Record<string, unknown> {
  return {
    id,
    title: 'Pour foundation',
    status: 'todo',
    assignees: [],
    visibleToClient: false,
    collaboratorCanSeeAllAttachments: true,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    order: 1,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: creator,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Registry CRUD — identical rule, run against BOTH pools.
// ---------------------------------------------------------------------------

describe.each(REGISTRIES)('%s registry', (registry) => {
  const path = (wid: string, tagId: string) => `workspaces/${wid}/${registry}/${tagId}`;
  const EXISTING = path(WKS_A, 'tag1');

  beforeEach(async () => {
    await seedDoc(testEnv, EXISTING, validTag('tag1'));
  });

  describe('read', () => {
    it('allows every firm member role to read a tag', async () => {
      for (const role of ['owner', 'admin', 'pm', 'viewer'] as const) {
        await assertSucceeds(getDoc(doc(dbAs(role), EXISTING)));
      }
    });

    it('denies a member of another workspace reading the tags', async () => {
      await assertFails(getDoc(doc(dbAs('owner', WKS_B), EXISTING)));
    });
  });

  describe('create', () => {
    it('allows owner, admin and pm to create a valid tag', async () => {
      for (const role of ['owner', 'admin', 'pm'] as const) {
        await assertSucceeds(
          setDoc(doc(dbAs(role), path(WKS_A, `t-${role}`)), validTag(`t-${role}`, `user-${role}`)),
        );
      }
    });

    it('denies a viewer creating a tag', async () => {
      await assertFails(
        setDoc(doc(dbAs('viewer'), path(WKS_A, 't-v')), validTag('t-v', 'user-viewer')),
      );
    });

    it('denies cross-workspace create even for an owner', async () => {
      await assertFails(
        setDoc(doc(dbAs('owner', WKS_B), path(WKS_A, 't-x')), validTag('t-x')),
      );
    });

    it('denies a name longer than 40 characters', async () => {
      await assertFails(
        setDoc(doc(dbAs('owner'), path(WKS_A, 't-x')), validTag('t-x', 'user-owner', {
          name: 'x'.repeat(41),
        })),
      );
    });

    it('denies an empty name', async () => {
      await assertFails(
        setDoc(doc(dbAs('owner'), path(WKS_A, 't-x')), validTag('t-x', 'user-owner', {
          name: '',
          normalizedName: '',
        })),
      );
    });

    it('denies a colour outside the palette enum', async () => {
      await assertFails(
        setDoc(doc(dbAs('owner'), path(WKS_A, 't-x')), validTag('t-x', 'user-owner', {
          color: 'chartreuse',
        })),
      );
    });

    it('denies createdBy or updatedBy not matching the caller', async () => {
      await assertFails(
        setDoc(doc(dbAs('admin'), path(WKS_A, 't-x')), validTag('t-x', 'user-admin', {
          createdBy: 'someone-else',
        })),
      );
      await assertFails(
        setDoc(doc(dbAs('admin'), path(WKS_A, 't-x')), validTag('t-x', 'user-admin', {
          updatedBy: 'someone-else',
        })),
      );
    });

    it('denies an id that mismatches the doc id', async () => {
      await assertFails(
        setDoc(doc(dbAs('owner'), path(WKS_A, 't-x')), validTag('other-id')),
      );
    });

    it('denies an unknown extra key', async () => {
      await assertFails(
        setDoc(doc(dbAs('owner'), path(WKS_A, 't-x')), validTag('t-x', 'user-owner', {
          usageCount: 3,
        })),
      );
    });

    it('denies writes to a billing-suspended (read_only) workspace', async () => {
      await assertFails(
        setDoc(
          doc(dbAs('owner', WKS_RO), `workspaces/${WKS_RO}/${registry}/t-ro`),
          validTag('t-ro'),
        ),
      );
    });
  });

  describe('update / rename', () => {
    it('allows owner, admin and pm to rename a tag', async () => {
      for (const role of ['owner', 'admin', 'pm'] as const) {
        await assertSucceeds(
          updateDoc(doc(dbAs(role), EXISTING), {
            name: `Renamed by ${role}`,
            normalizedName: `renamed by ${role}`,
            updatedAt: Timestamp.now(),
            updatedBy: `user-${role}`,
          }),
        );
      }
    });

    it('denies a viewer renaming a tag', async () => {
      await assertFails(
        updateDoc(doc(dbAs('viewer'), EXISTING), {
          name: 'Hacked',
          normalizedName: 'hacked',
          updatedAt: Timestamp.now(),
          updatedBy: 'user-viewer',
        }),
      );
    });

    it('denies mutating the immutable id / createdAt / createdBy fields', async () => {
      const tampering: Array<Record<string, unknown>> = [
        { id: 'renamed' },
        { createdAt: Timestamp.now() },
        { createdBy: 'user-admin' },
      ];
      for (const patch of tampering) {
        await assertFails(
          updateDoc(doc(dbAs('owner'), EXISTING), {
            ...patch,
            updatedAt: Timestamp.now(),
            updatedBy: 'user-owner',
          }),
        );
      }
    });

    it('denies an update that leaves updatedBy != the caller', async () => {
      await assertFails(
        updateDoc(doc(dbAs('owner'), EXISTING), {
          name: 'Renamed',
          normalizedName: 'renamed',
          updatedAt: Timestamp.now(),
          updatedBy: 'someone-else',
        }),
      );
    });

    it('denies renaming to a name longer than 40 characters', async () => {
      await assertFails(
        updateDoc(doc(dbAs('owner'), EXISTING), {
          name: 'x'.repeat(41),
          normalizedName: 'x'.repeat(41),
          updatedAt: Timestamp.now(),
          updatedBy: 'user-owner',
        }),
      );
    });
  });

  describe('delete', () => {
    it('allows owner, admin and pm to delete a tag from the registry', async () => {
      for (const role of ['owner', 'admin', 'pm'] as const) {
        await seedDoc(testEnv, path(WKS_A, `del-${role}`), validTag(`del-${role}`));
        await assertSucceeds(deleteDoc(doc(dbAs(role), path(WKS_A, `del-${role}`))));
      }
    });

    it('denies a viewer deleting a tag', async () => {
      await assertFails(deleteDoc(doc(dbAs('viewer'), EXISTING)));
    });

    it('denies cross-workspace delete', async () => {
      await assertFails(deleteDoc(doc(dbAs('owner', WKS_B), EXISTING)));
    });
  });
});

// ---------------------------------------------------------------------------
// Tag arrays on project + task docs.
// ---------------------------------------------------------------------------

describe('project.tags array', () => {
  beforeEach(async () => {
    await seedDoc(testEnv, PROJ_PATH, validProject('proj-site'));
  });

  it('allows owner/admin/pm to set a valid tags array on update', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('pm'), PROJ_PATH), {
        tags: ['t1', 't2', 't3'],
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('allows a create carrying a tags array', async () => {
    await assertSucceeds(
      setDoc(
        doc(dbAs('owner'), `workspaces/${WKS_A}/projects/proj-tagged`),
        validProject('proj-tagged', { tags: ['t1'] }),
      ),
    );
  });

  it('treats an absent tags field as valid (back-compat)', async () => {
    await assertSucceeds(
      updateDoc(doc(dbAs('pm'), PROJ_PATH), { name: 'No tags here', updatedAt: Timestamp.now() }),
    );
  });

  it('denies a tags array with more than 20 entries', async () => {
    await assertFails(
      updateDoc(doc(dbAs('pm'), PROJ_PATH), {
        tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('denies a non-list tags value', async () => {
    await assertFails(
      updateDoc(doc(dbAs('pm'), PROJ_PATH), {
        tags: 'not-a-list',
        updatedAt: Timestamp.now(),
      }),
    );
  });

  it('denies a viewer setting tags', async () => {
    await assertFails(
      updateDoc(doc(dbAs('viewer'), PROJ_PATH), {
        tags: ['t1'],
        updatedAt: Timestamp.now(),
      }),
    );
  });
});

describe('task.tags array', () => {
  it('allows owner/admin/pm to create a task carrying a tags array', async () => {
    await assertSucceeds(
      setDoc(doc(dbAs('pm'), TASK_PATH), validTask('task1', { tags: ['t1', 't2'] }, 'user-pm')),
    );
  });

  it('allows creating a task with no tags field (back-compat)', async () => {
    await assertSucceeds(
      setDoc(doc(dbAs('pm'), `workspaces/${WKS_A}/projects/proj-site/tasks/task-notags`), validTask(
        'task-notags',
        {},
        'user-pm',
      )),
    );
  });

  it('denies a task tags array with more than 20 entries', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('pm'), `workspaces/${WKS_A}/projects/proj-site/tasks/task-big`),
        validTask('task-big', { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }, 'user-pm'),
      ),
    );
  });

  it('denies a non-list task tags value', async () => {
    await assertFails(
      setDoc(
        doc(dbAs('pm'), `workspaces/${WKS_A}/projects/proj-site/tasks/task-bad`),
        validTask('task-bad', { tags: 'nope' }, 'user-pm'),
      ),
    );
  });
});
