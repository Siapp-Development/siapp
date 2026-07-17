import type { IWorkspaceClaims } from '@siapp/shared';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import {
  Timestamp,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { auth, db } from '@/lib/firebase.ts';
import { parseWorkspaceClaims } from './resolveWorkspace.ts';

/** Slug/name of a workspace the signed-in user belongs to (from claims). */
export interface IClaimedWorkspace {
  id: string;
  name: string;
  slug: string;
}

export type TClaimedWorkspaces = IClaimedWorkspace[] | 'loading' | 'error';

export type TAuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | {
      status: 'signedIn';
      user: User;
      claims: IWorkspaceClaims;
      /** Live `users/{uid}.defaultWorkspaceId`, if set. */
      defaultWorkspaceId?: string;
      /** Workspace docs for every claimed wid — cached here so guards share one fetch. */
      workspaces: TClaimedWorkspaces;
    };

export interface IAuthContextValue {
  state: TAuthState;
  signOutUser: () => Promise<void>;
}

export const AuthContext = createContext<IAuthContextValue | null>(null);

interface ITokenState {
  user: User;
  claims: IWorkspaceClaims;
}

/**
 * Create-or-refresh the caller's own `users/{uid}` profile. Tokens are never
 * persisted by app code (D-007) — this only mirrors profile fields validated
 * by firestore.rules. A doc that only carries the server-side
 * `claimsUpdatedAt` stamp counts as missing and gets the full profile merged.
 */
async function upsertOwnProfile(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid);
  const snapshot = await getDoc(ref);
  const hasProfile = snapshot.exists() && typeof snapshot.data()['email'] === 'string';

  if (hasProfile) {
    await updateDoc(ref, { lastSeenAt: serverTimestamp() });
    return;
  }

  const email = user.email ?? '';
  await setDoc(
    ref,
    {
      uid: user.uid,
      email,
      displayName: user.displayName ?? (email === '' ? 'Member' : email),
      locale: 'en',
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export interface IAuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: IAuthProviderProps) {
  const [token, setToken] = useState<ITokenState | null | 'pending'>('pending');
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState<string | undefined>(undefined);
  const [workspaces, setWorkspaces] = useState<TClaimedWorkspaces>('loading');

  // 1) Track the SDK token — fires on sign-in/out and on every token refresh.
  useEffect(() => {
    return onIdTokenChanged(auth, (user) => {
      if (user === null) {
        setToken(null);
        return;
      }
      user
        .getIdTokenResult()
        .then((result) => {
          setToken({ user, claims: parseWorkspaceClaims(result.claims) });
        })
        .catch(() => {
          // Token read failed (e.g. network drop mid-refresh) — treat as
          // signed out; the SDK retries and re-fires this listener.
          setToken(null);
        });
    });
  }, []);

  const uid = token !== 'pending' && token !== null ? token.user.uid : null;

  // 2) Own users/{uid} doc: upsert on sign-in, then live-subscribe so the
  //    claimsUpdatedAt stamp written by syncMemberClaims forces an immediate
  //    getIdToken(true) — role changes propagate in seconds, not <=1h.
  useEffect(() => {
    if (uid === null) {
      setDefaultWorkspaceId(undefined);
      return;
    }
    const user = auth.currentUser;
    if (user === null) {
      return;
    }

    upsertOwnProfile(user).catch(() => {
      // Best-effort: profile writes are re-validated by rules server-side;
      // sign-in itself must not fail on a profile write hiccup.
    });

    let lastStamp: number | null | 'unset' = 'unset';
    return onSnapshot(doc(db, 'users', uid), (snapshot) => {
      const data = snapshot.data();
      const stampField = data?.['claimsUpdatedAt'];
      const stamp = stampField instanceof Timestamp ? stampField.toMillis() : null;
      const defaultWid = data?.['defaultWorkspaceId'];
      setDefaultWorkspaceId(typeof defaultWid === 'string' ? defaultWid : undefined);

      if (lastStamp !== 'unset' && stamp !== null && stamp !== lastStamp) {
        // Claims were re-stamped server-side — refresh the ID token now.
        void user.getIdToken(true);
      }
      lastStamp = stamp;
    });
  }, [uid]);

  const claimsKey =
    token !== 'pending' && token !== null
      ? Object.keys(token.claims.workspaces).sort().join(',')
      : '';

  // 3) Cache the workspace doc (slug/name) of every claimed workspace.
  useEffect(() => {
    if (uid === null || claimsKey === '') {
      setWorkspaces(uid === null ? 'loading' : []);
      return;
    }
    let cancelled = false;
    setWorkspaces('loading');

    Promise.all(
      claimsKey.split(',').map(async (wid): Promise<IClaimedWorkspace | null> => {
        const snapshot = await getDoc(doc(db, 'workspaces', wid));
        const data = snapshot.data();
        const name = data?.['name'];
        const slug = data?.['slug'];
        if (typeof name !== 'string' || typeof slug !== 'string') {
          return null;
        }
        return { id: wid, name, slug };
      }),
    )
      .then((entries) => {
        if (!cancelled) {
          setWorkspaces(entries.filter((entry): entry is IClaimedWorkspace => entry !== null));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaces('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [uid, claimsKey]);

  const state: TAuthState = useMemo(() => {
    if (token === 'pending') {
      return { status: 'loading' };
    }
    if (token === null) {
      return { status: 'signedOut' };
    }
    return {
      status: 'signedIn',
      user: token.user,
      claims: token.claims,
      defaultWorkspaceId,
      workspaces,
    };
  }, [token, defaultWorkspaceId, workspaces]);

  const value = useMemo<IAuthContextValue>(
    () => ({ state, signOutUser: () => signOut(auth) }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
