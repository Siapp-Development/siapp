/**
 * In-memory Firestore stand-in for the client-portal `magicLinks` collection,
 * used by the #142 (Part B) get-or-create tests. It models the ONE property the
 * TOCTOU fix depends on: OPTIMISTIC-CONCURRENCY transactions keyed on the
 * documents a transaction READS. Every doc carries a `version`; a transaction
 * records the version of each doc it reads and, at commit, aborts+retries if any
 * read doc changed — exactly how Firestore serializes on a specific docRef (the
 * deterministic anchor). Empty-result queries are irrelevant here because the
 * fix reads a deterministic docRef, never a query, inside the transaction.
 *
 * `setContentionHook` injects a competing transaction that commits between our
 * first read and our commit, so a real production get-or-create can be driven
 * into the retry path and shown to converge on a single link (D-042).
 *
 * NOT a general Firestore fake — it supports exactly what these callables touch:
 * `db.doc(path).get()` (project/workspace reads), `db.collection(path)` →
 * `.doc(id?)`, and `db.runTransaction(fn)` with docRef `get`/`set`/`update`.
 */

import type { Firestore } from 'firebase-admin/firestore';

export interface IFakeStoredDoc {
  id: string;
  data: Record<string, unknown>;
  exists: boolean;
  version: number;
}

interface IFakeDocRef {
  id: string;
  __fakeDocId: string;
}

export interface IFakeMagicLinksOptions {
  /** Seed magicLink docs (link docs or a pre-existing anchor) by id. */
  links?: Array<{ id: string; data: Record<string, unknown> }>;
  /** Seed non-magicLinks docs addressed by full path via `db.doc(path)`. */
  pathDocs?: Record<string, Record<string, unknown> | undefined>;
}

export interface IFakeMagicLinksDb {
  /** Structurally a subset of Firestore — enough for these callables. */
  db: Firestore;
  /** Every magicLinks doc (links + anchors) keyed by id. */
  store: Map<string, IFakeStoredDoc>;
  /** Active (unrevoked) client link docs — the one-active-link assertion set. */
  activeClientLinks: () => IFakeStoredDoc[];
  /** Install a one-shot competing transaction fired on the next tx read. */
  setContentionHook: (hook: () => void | Promise<void>) => void;
}

export function makeFakeMagicLinksDb(opts: IFakeMagicLinksOptions = {}): IFakeMagicLinksDb {
  const store = new Map<string, IFakeStoredDoc>();
  for (const seed of opts.links ?? []) {
    store.set(seed.id, { id: seed.id, data: { ...seed.data }, exists: true, version: 1 });
  }
  const pathDocs = opts.pathDocs ?? {};
  let auto = 0;
  let contentionHook: (() => void | Promise<void>) | null = null;

  function ensure(id: string): IFakeStoredDoc {
    let doc = store.get(id);
    if (doc === undefined) {
      doc = { id, data: {}, exists: false, version: 0 };
      store.set(id, doc);
    }
    return doc;
  }

  function snapshotOf(doc: IFakeStoredDoc) {
    const frozen = doc.exists ? { ...doc.data } : undefined;
    return {
      id: doc.id,
      exists: doc.exists,
      get: (field: string) => frozen?.[field],
      data: () => frozen,
      ref: { id: doc.id, __fakeDocId: doc.id },
    };
  }

  const collectionRef = {
    doc: (id?: string): IFakeDocRef => {
      const docId = id ?? `newlink${(auto += 1)}`;
      return { id: docId, __fakeDocId: docId };
    },
  };

  async function runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const MAX_ATTEMPTS = 6;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const reads = new Map<string, number>();
      const writes: Array<{ id: string; data: Record<string, unknown>; op: 'set' | 'update' }> = [];
      const tx = {
        get: async (ref: IFakeDocRef) => {
          const doc = ensure(ref.__fakeDocId);
          reads.set(doc.id, doc.version);
          const snap = snapshotOf(doc);
          // Fire the one-shot competitor AFTER capturing our read version, so it
          // commits "between" our read and our commit → our commit conflicts and
          // retries (models two concurrent first-mints for the same triple).
          if (contentionHook !== null) {
            const hook = contentionHook;
            contentionHook = null;
            await hook();
          }
          return snap;
        },
        set: (ref: IFakeDocRef, data: Record<string, unknown>) => {
          writes.push({ id: ref.__fakeDocId, data: { ...data }, op: 'set' });
        },
        update: (ref: IFakeDocRef, data: Record<string, unknown>) => {
          writes.push({ id: ref.__fakeDocId, data: { ...data }, op: 'update' });
        },
      };
      const result = await fn(tx);
      const conflicted = [...reads].some(([id, version]) => ensure(id).version !== version);
      if (conflicted) {
        continue; // discard staged writes, re-run against fresh state
      }
      for (const write of writes) {
        const doc = ensure(write.id);
        doc.data = write.op === 'set' ? { ...write.data } : { ...doc.data, ...write.data };
        doc.exists = true;
        doc.version += 1;
      }
      return result;
    }
    throw new Error('fake runTransaction exceeded max retries');
  }

  const db = {
    collection: () => collectionRef,
    doc: (path: string) => ({
      get: () => {
        const data = pathDocs[path];
        return Promise.resolve({
          exists: data !== undefined,
          get: (field: string) => data?.[field],
          data: () => data,
        });
      },
    }),
    runTransaction,
  };

  return {
    db: db as unknown as Firestore,
    store,
    activeClientLinks: () =>
      [...store.values()].filter(
        (doc) => doc.exists && doc.data['audience'] === 'client' && doc.data['revoked'] === false,
      ),
    setContentionHook: (hook) => {
      contentionHook = hook;
    },
  };
}
