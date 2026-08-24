/**
 * useTags + tag writers (D-041): the two independent registries (projectTags /
 * taskTags) must subscribe to distinct collections, map docs to a live
 * name+colour Map, default unknown colours to slate, and expose create/rename/
 * delete writers that hit the scoped collection. Firestore is mocked at the
 * SDK boundary; snapshots are pushed manually.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  subscriptions: [] as Array<{
    path: string;
    next: (snapshot: unknown) => void;
    error: () => void;
  }>,
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  autoId: 'auto-generated-id',
}));

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __type: 'collection', path }),
  doc: (ref: unknown, id?: string) => {
    // doc(collectionRef) → auto-id ref; doc(db, pathString) → explicit path.
    if (typeof id === 'string') {
      return { __type: 'doc', path: id };
    }
    const col = ref as { path: string };
    return { __type: 'doc', id: fs.autoId, path: `${col.path}/${fs.autoId}` };
  },
  onSnapshot: (
    ref: { path: string },
    next: (snapshot: unknown) => void,
    error: () => void,
  ) => {
    fs.subscriptions.push({ path: ref.path, next, error });
    return () => {};
  },
  serverTimestamp: () => '__serverTimestamp__',
  setDoc: (...args: unknown[]) => fs.setDoc(...args),
  updateDoc: (...args: unknown[]) => fs.updateDoc(...args),
  deleteDoc: (...args: unknown[]) => fs.deleteDoc(...args),
}));

import {
  createTag,
  deleteTag,
  nextTagColor,
  normalizeTagName,
  renameTag,
  useTags,
} from './useTags.ts';

function fakeTagDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

function emit(index: number, docs: unknown[]): void {
  act(() => fs.subscriptions[index].next({ docs }));
}

beforeEach(() => {
  fs.subscriptions.length = 0;
  fs.autoId = 'auto-generated-id';
  vi.clearAllMocks();
});

describe('useTags subscription', () => {
  it("subscribes to workspaces/{wid}/projectTags for the 'project' scope", () => {
    renderHook(() => useTags('wksA', 'project'));

    expect(fs.subscriptions).toHaveLength(1);
    expect(fs.subscriptions[0].path).toBe('workspaces/wksA/projectTags');
  });

  it("subscribes to workspaces/{wid}/taskTags for the 'task' scope (a distinct pool)", () => {
    renderHook(() => useTags('wksA', 'task'));

    expect(fs.subscriptions[0].path).toBe('workspaces/wksA/taskTags');
  });

  it('starts in the loading state with an empty map', () => {
    const { result } = renderHook(() => useTags('wksA', 'project'));

    expect(result.current.status).toBe('loading');
    expect(result.current.tags.size).toBe(0);
  });

  it('maps snapshot docs to a live Map<id, {name, color}>', () => {
    const { result } = renderHook(() => useTags('wksA', 'project'));

    emit(0, [
      fakeTagDoc('t1', { name: 'Urgent', color: 'red' }),
      fakeTagDoc('t2', { name: 'VIP', color: 'blue' }),
    ]);

    expect(result.current.status).toBe('ready');
    expect(result.current.tags.get('t1')).toEqual({ name: 'Urgent', color: 'red' });
    expect(result.current.tags.get('t2')).toEqual({ name: 'VIP', color: 'blue' });
  });

  it('defaults an unknown/legacy colour to slate so a tag never renders invisibly', () => {
    const { result } = renderHook(() => useTags('wksA', 'project'));

    emit(0, [fakeTagDoc('t1', { name: 'Weird', color: 'chartreuse' })]);

    expect(result.current.tags.get('t1')).toEqual({ name: 'Weird', color: 'slate' });
  });

  it('reports the error state when the subscription fails', () => {
    const { result } = renderHook(() => useTags('wksA', 'project'));

    act(() => fs.subscriptions[0].error());

    expect(result.current.status).toBe('error');
    expect(result.current.tags.size).toBe(0);
  });
});

describe('tag writers', () => {
  it('createTag writes a fully-shaped doc to the scoped collection and returns the new id', async () => {
    fs.autoId = 'new-tag-99';
    fs.setDoc.mockResolvedValue(undefined);

    const id = await createTag('wksA', 'task', 'High Priority', 'amber', 'user-1');

    expect(id).toBe('new-tag-99');
    const [ref, data] = fs.setDoc.mock.calls[0];
    expect(ref.path).toBe('workspaces/wksA/taskTags/new-tag-99');
    expect(data).toMatchObject({
      id: 'new-tag-99',
      name: 'High Priority',
      normalizedName: 'high priority',
      color: 'amber',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    });
  });

  it('renameTag updates name + normalizedName on the scoped doc', async () => {
    fs.updateDoc.mockResolvedValue(undefined);

    await renameTag('wksA', 'project', 't1', 'Renamed', 'user-2');

    const [ref, data] = fs.updateDoc.mock.calls[0];
    expect(ref.path).toBe('workspaces/wksA/projectTags/t1');
    expect(data).toMatchObject({ name: 'Renamed', normalizedName: 'renamed', updatedBy: 'user-2' });
  });

  it('deleteTag removes the scoped registry doc', async () => {
    fs.deleteDoc.mockResolvedValue(undefined);

    await deleteTag('wksA', 'task', 't9');

    const [ref] = fs.deleteDoc.mock.calls[0];
    expect(ref.path).toBe('workspaces/wksA/taskTags/t9');
  });
});

describe('normalizeTagName', () => {
  it('lower-cases and trims', () => {
    expect(normalizeTagName('  High Priority  ')).toBe('high priority');
  });
});

describe('nextTagColor', () => {
  it('assigns colours round-robin over the palette', () => {
    expect(nextTagColor(0)).toBe('slate');
    expect(nextTagColor(1)).toBe('red');
    // Wraps back to the first colour after a full lap (palette length 8).
    expect(nextTagColor(8)).toBe('slate');
  });
});
