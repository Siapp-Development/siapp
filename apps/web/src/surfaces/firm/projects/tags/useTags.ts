/**
 * Tag registry subscription + writers for the two independent pools (D-041).
 * `useTags(wid, scope)` subscribes to `workspaces/{wid}/projectTags` OR
 * `workspaces/{wid}/taskTags` depending on `scope`; the writers take the same
 * `scope`. The hook returns a live `Map<tagId, { name, color }>` used to join
 * a doc's `tags` (ids) to display name + colour. Orphaned ids (registry doc
 * deleted) simply never appear in the map, so they vanish on read.
 */

import type { TTagColor, TTagScope } from '@siapp/shared';
import { TAG_COLORS } from '@siapp/shared';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase.ts';

export interface ITagEntry {
  name: string;
  color: TTagColor;
}

export type TTagsState =
  | { status: 'loading'; tags: ReadonlyMap<string, ITagEntry> }
  | { status: 'error'; tags: ReadonlyMap<string, ITagEntry> }
  | { status: 'ready'; tags: ReadonlyMap<string, ITagEntry> };

const EMPTY_TAGS: ReadonlyMap<string, ITagEntry> = new Map();

/** Maps a tag scope to its Firestore collection segment. */
function tagsCollectionPath(workspaceId: string, scope: TTagScope): string {
  return `workspaces/${workspaceId}/${scope === 'project' ? 'projectTags' : 'taskTags'}`;
}

/** Narrows an arbitrary string to a known palette key, defaulting to slate. */
function asTagColor(value: unknown): TTagColor {
  return typeof value === 'string' && (TAG_COLORS as readonly string[]).includes(value)
    ? (value as TTagColor)
    : 'slate';
}

function mapTagEntry(data: DocumentData): ITagEntry {
  return { name: String(data['name'] ?? ''), color: asTagColor(data['color']) };
}

export function useTags(workspaceId: string, scope: TTagScope): TTagsState {
  const [state, setState] = useState<TTagsState>({ status: 'loading', tags: EMPTY_TAGS });

  useEffect(() => {
    setState({ status: 'loading', tags: EMPTY_TAGS });
    return onSnapshot(
      collection(db, tagsCollectionPath(workspaceId, scope)),
      (snapshot) => {
        const tags = new Map<string, ITagEntry>();
        for (const docSnap of snapshot.docs) {
          tags.set(docSnap.id, mapTagEntry(docSnap.data()));
        }
        setState({ status: 'ready', tags });
      },
      () => setState({ status: 'error', tags: EMPTY_TAGS }),
    );
  }, [workspaceId, scope]);

  return state;
}

/** Lower-cased, trimmed form used for client-side duplicate prevention. */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Creates a tag in the scoped registry. Duplicate-name prevention is the
 * caller's job (rules impose no uniqueness); returns the new tag id.
 */
export async function createTag(
  workspaceId: string,
  scope: TTagScope,
  name: string,
  color: TTagColor,
  uid: string,
): Promise<string> {
  const ref = doc(collection(db, tagsCollectionPath(workspaceId, scope)));
  await setDoc(ref, {
    id: ref.id,
    name,
    normalizedName: normalizeTagName(name),
    color,
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  return ref.id;
}

/** Renames a tag; the change propagates to every doc that references it. */
export async function renameTag(
  workspaceId: string,
  scope: TTagScope,
  tagId: string,
  name: string,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, `${tagsCollectionPath(workspaceId, scope)}/${tagId}`), {
    name,
    normalizedName: normalizeTagName(name),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

/**
 * Deletes a tag from the registry entirely. Because project/task docs store
 * ids and resolve on read, the chip disappears wherever it was used — no
 * fan-out sweep (D-041).
 */
export async function deleteTag(
  workspaceId: string,
  scope: TTagScope,
  tagId: string,
): Promise<void> {
  await deleteDoc(doc(db, `${tagsCollectionPath(workspaceId, scope)}/${tagId}`));
}

/** Round-robin palette assignment for inline tag create (deterministic). */
export function nextTagColor(existingCount: number): TTagColor {
  return TAG_COLORS[existingCount % TAG_COLORS.length];
}
