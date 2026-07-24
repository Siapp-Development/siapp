/**
 * Collab session bootstrap (#22, D-a): redeem the URL token via the
 * redeemCollabLink callable, sign in with the returned custom token, and
 * expose the scoped session (ids + branding + task snapshot) to the /t tree.
 *
 * Mirrors usePortalSession: a live session is reused without re-redeeming
 * when the signed-in user already carries matching collab claims AND the
 * redeem response is cached in sessionStorage (branding/task snapshot only
 * arrive in the redeem response).
 */

import type { ICollabTaskSnapshot, IPortalBranding, TRedeemCollabLinkResponse } from '@siapp/shared';
import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { auth, functions } from '@/lib/firebase.ts';

export interface ICollabSession {
  workspaceId: string;
  projectId: string;
  taskId: string;
  collaboratorId: string;
  branding: IPortalBranding;
  task: ICollabTaskSnapshot;
}

export type TCollabSessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: ICollabSession }
  | { status: 'not_started'; firmName: string }
  | { status: 'invalid' }
  | { status: 'error' };

const CACHE_KEY = 'siapp.collabSession';

function readCachedSession(): ICollabSession | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ICollabSession>;
    return typeof parsed.taskId === 'string' &&
      typeof parsed.workspaceId === 'string' &&
      typeof parsed.projectId === 'string' &&
      typeof parsed.collaboratorId === 'string' &&
      typeof parsed.branding === 'object' &&
      parsed.branding !== null &&
      typeof parsed.task === 'object' &&
      parsed.task !== null
      ? (parsed as ICollabSession)
      : null;
  } catch {
    return null;
  }
}

function writeCachedSession(session: ICollabSession): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(session));
  } catch {
    // Private mode / storage quota — session just re-redeems on reload.
  }
}

/** Stable collab error code from an HttpsError's details, or null. */
export function collabErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'details' in error) {
    const details = (error as { details?: unknown }).details;
    if (typeof details === 'object' && details !== null && 'code' in details) {
      const code = (details as { code?: unknown }).code;
      if (typeof code === 'string' && code.startsWith('collab/')) {
        return code;
      }
    }
  }
  return null;
}

export function useCollabSession(token: string | undefined): {
  state: TCollabSessionState;
  retry: () => void;
} {
  const [state, setState] = useState<TCollabSessionState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      if (token === undefined || token === '') {
        setState({ status: 'invalid' });
        return;
      }
      setState({ status: 'loading' });

      // Reuse a live session (page refresh) — skip the redeem when the
      // current user's collab claims match the cached redeem response.
      const user = auth.currentUser;
      if (user !== null) {
        const cached = readCachedSession();
        if (cached !== null) {
          const claims = (await user.getIdTokenResult()).claims as {
            collab?: { tid?: unknown };
          };
          if (cancelled) {
            return;
          }
          if (claims.collab?.tid === cached.taskId) {
            setState({ status: 'ready', session: cached });
            return;
          }
        }
      }

      try {
        const redeem = httpsCallable<{ token: string }, TRedeemCollabLinkResponse>(
          functions,
          'redeemCollabLink',
        );
        const response = (await redeem({ token })).data;
        if (cancelled) {
          return;
        }
        if (response.status === 'not_started') {
          setState({ status: 'not_started', firmName: response.firmName });
          return;
        }
        await signInWithCustomToken(auth, response.customToken);
        const session: ICollabSession = {
          workspaceId: response.workspaceId,
          projectId: response.projectId,
          taskId: response.taskId,
          collaboratorId: response.collaboratorId,
          branding: response.branding,
          task: response.task,
        };
        writeCachedSession(session);
        if (!cancelled) {
          setState({ status: 'ready', session });
        }
      } catch (error) {
        if (!cancelled) {
          setState(
            collabErrorCode(error) === 'collab/invalid_or_expired'
              ? { status: 'invalid' }
              : { status: 'error' },
          );
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}

const CollabSessionContext = createContext<ICollabSession | null>(null);

export const CollabSessionProvider = CollabSessionContext.Provider;

/** The redeemed session — only usable under a ready CollabTaskPage. */
export function useCollabSessionContext(): ICollabSession {
  const session = useContext(CollabSessionContext);
  if (session === null) {
    throw new Error('useCollabSessionContext must be used inside CollabTaskPage');
  }
  return session;
}
