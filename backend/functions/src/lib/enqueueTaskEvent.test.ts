/**
 * #137 Part D read-gating (Case A). `planTaskNotifications` receives an
 * already-resolved `memberProfiles` map, so the planning-layer suite CANNOT
 * prove that `enqueueTaskEvent` actually FETCHES those profiles when the
 * workspace config says `toInternal:false`. That override lives in
 * `enqueueTaskEvent` (the `effectiveNotify.toInternal` read gate). These tests
 * exercise it end-to-end against a tiny in-memory Firestore fake — no emulator —
 * following the pattern in dispatchQueue.test.ts / assignedTasksMirror.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Shared mutable store the fake Firestore reads/writes. `vi.hoisted` runs before
// the (hoisted) `vi.mock` factory.
const store = vi.hoisted(() => ({
  // path -> doc data (undefined = missing doc)
  docs: new Map<string, Record<string, unknown> | undefined>(),
  reads: [] as string[],
  writes: [] as Array<{ path: string; data: Record<string, unknown> }>,
  created: new Set<string>(),
}));

vi.mock('firebase-admin/firestore', () => {
  let autoId = 0;

  function makeDocRef(path: string) {
    return {
      id: path.slice(path.lastIndexOf('/') + 1),
      get: () => {
        store.reads.push(path);
        const data = store.docs.get(path);
        return Promise.resolve({ exists: data !== undefined, data: () => data });
      },
      // enqueueTaskEvent uses create() so deterministic ids dedupe silently.
      create: (data: Record<string, unknown>) => {
        if (store.created.has(path)) {
          // ALREADY_EXISTS (gRPC code 6) — the due-soon dedupe path.
          return Promise.reject({ code: 6 });
        }
        store.created.add(path);
        store.writes.push({ path, data });
        return Promise.resolve({});
      },
    };
  }

  function makeCollection(prefix: string) {
    return {
      doc: (id?: string) => makeDocRef(`${prefix}/${id ?? `__auto_${autoId++}`}`),
    };
  }

  const fakeDb = {
    doc: (path: string) => makeDocRef(path),
    collection: (path: string) => makeCollection(path),
  };

  return {
    getFirestore: () => fakeDb,
  };
});

// Imported AFTER the mock so it binds the faked firebase-admin/firestore.
import { enqueueTaskEvent, type IEnqueueTaskEventParams } from './enqueueNotifications.js';

// 12:00 UTC = 20:00 MYT — outside the default 21:00–08:00 quiet window.
const OUTSIDE_QUIET = new Date('2026-07-23T12:00:00Z');

const CONFIG_CLIENT_ONLY = {
  statusChange: true,
  dueSoon: true,
  blocked: true,
  toClient: true,
  toInternal: false,
};

function dueSoonTaskData(notify: Record<string, unknown> = CONFIG_CLIENT_ONLY): Record<string, unknown> {
  return {
    title: 'Inspection',
    status: 'todo',
    sendWhatsapp: true,
    assignees: [
      { type: 'user', id: 'u1', name: 'Alice' },
      { type: 'user', id: 'u2', name: 'Sam' },
    ],
    dueDate: { toDate: () => new Date('2026-07-24T04:00:00Z') },
    notify,
  };
}

function params(overrides: Partial<IEnqueueTaskEventParams> = {}): IEnqueueTaskEventParams {
  return {
    workspaceId: 'w1',
    projectId: 'p1',
    taskId: 't1',
    trigger: 'task_due_soon',
    taskData: dueSoonTaskData(),
    projectData: { name: 'Bungalow Reno', lifecycle: 'published', clientId: 'client1' },
    now: OUTSIDE_QUIET,
    ...overrides,
  };
}

function seedWorkspace(): void {
  store.docs.set('workspaces/w1', { name: 'Acme Builders' });
  store.docs.set('workspaces/w1/clients/client1', {
    name: 'Ahmad',
    phone: '+60123456789',
    waConsent: { granted: true },
  });
  store.docs.set('users/u1', { phone: '+60122222222' });
  store.docs.set('users/u2', { phone: '+60133333333' });
}

function writesByType(): Array<Record<string, unknown>> {
  return store.writes.map((w) => w.data);
}

describe('enqueueTaskEvent — #137 Part D read-gating (Case A, fake db)', () => {
  beforeEach(() => {
    store.docs.clear();
    store.reads = [];
    store.writes = [];
    store.created.clear();
    seedWorkspace();
  });

  it('due_soon with config toClient:true,toInternal:false STILL fetches member profiles and enqueues members', async () => {
    const written = await enqueueTaskEvent(params());

    // Read gate override: member profiles fetched despite toInternal:false…
    expect(store.reads).toContain('users/u1');
    expect(store.reads).toContain('users/u2');
    // …and the client doc is NEVER read despite toClient:true (override forces it off).
    expect(store.reads.some((p) => p.startsWith('workspaces/w1/clients/'))).toBe(false);

    // Two member records written, both QUEUED (not spuriously suppressed no_phone),
    // with the real phones the profile fetch resolved.
    expect(written).toBe(2);
    const datas = writesByType();
    expect(datas).toHaveLength(2);
    expect(datas.every((d) => d['recipientType'] === 'member')).toBe(true);
    expect(datas.every((d) => d['status'] === 'queued')).toBe(true);
    expect(datas.every((d) => d['suppressed'] === undefined)).toBe(true);
    expect(datas.some((d) => d['recipientType'] === 'client')).toBe(false);
    expect(datas.map((d) => d['recipientId']).sort()).toEqual(['u1', 'u2']);
    expect(datas.map((d) => d['recipientPhone']).sort()).toEqual(['+60122222222', '+60133333333']);

    // Deterministic per-member dedupe ids drive the doc paths.
    expect(store.writes.map((w) => w.path).sort()).toEqual([
      'workspaces/w1/messages/dueSoon_p1_t1_2026-07-23_member_u1',
      'workspaces/w1/messages/dueSoon_p1_t1_2026-07-23_member_u2',
    ]);
  });

  it('due_soon members are NOT suppressed as no_phone (proves fetch happened, not empty map)', async () => {
    const written = await enqueueTaskEvent(params());
    expect(written).toBe(2);
    // The only way a member could be no_phone here is if the profile fetch was
    // skipped (empty map -> phone null). Assert the opposite explicitly.
    expect(writesByType().some((d) => d['suppressedReason'] === 'no_phone')).toBe(false);
  });

  it('task_status_change (default config) reads the CLIENT, never member profiles — routing unchanged', async () => {
    // Default config toClient:true,toInternal:false and NO due-soon override:
    // the client is the recipient and member profiles must not be fetched.
    const written = await enqueueTaskEvent(
      params({ trigger: 'task_status_change', taskData: dueSoonTaskData() }),
    );

    expect(store.reads).toContain('workspaces/w1/clients/client1');
    expect(store.reads.some((p) => p === 'users/u1' || p === 'users/u2')).toBe(false);
    expect(written).toBe(1);
    const datas = writesByType();
    expect(datas).toHaveLength(1);
    expect(datas[0]['recipientType']).toBe('client');
    expect(datas[0]['recipientId']).toBe('client1');
    expect(datas[0]['trigger']).toBe('task_status_change');
  });

  it('task_blocked (default config) routes to the client at the read layer too', async () => {
    const written = await enqueueTaskEvent(
      params({
        trigger: 'task_blocked',
        taskData: { ...dueSoonTaskData(), status: 'blocked', blockedReason: 'Waiting on materials' },
      }),
    );
    expect(store.reads).toContain('workspaces/w1/clients/client1');
    expect(store.reads.some((p) => p === 'users/u1' || p === 'users/u2')).toBe(false);
    expect(written).toBe(1);
    expect(writesByType()[0]['recipientType']).toBe('client');
  });

  it('re-running the same due_soon event dedupes via ALREADY_EXISTS (writes nothing the second time)', async () => {
    const first = await enqueueTaskEvent(params());
    expect(first).toBe(2);
    // Second identical run: create() rejects with code 6 for both ids -> caught.
    const second = await enqueueTaskEvent(params());
    expect(second).toBe(0);
    expect(store.writes).toHaveLength(2);
  });

  it('a draft project still WRITES due_soon member records, suppressed lifecycle:<state> (Case B)', async () => {
    const written = await enqueueTaskEvent(
      params({ projectData: { name: 'P', lifecycle: 'draft', clientId: 'client1' } }),
    );
    // Suppressed records ARE persisted (D-027 preview), one per member.
    expect(written).toBe(2);
    const datas = writesByType();
    expect(datas).toHaveLength(2);
    expect(
      datas.every(
        (d) =>
          d['recipientType'] === 'member' &&
          d['suppressed'] === true &&
          d['suppressedReason'] === 'lifecycle:draft',
      ),
    ).toBe(true);
  });
});
