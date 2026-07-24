/**
 * Portal session bootstrap (#21, D1): redeem the URL token via the
 * redeemPortalLink callable, sign in with the returned custom token, and
 * expose the scoped session (ids + branding snapshot, D6) to the portal tree.
 *
 * A live session is reused without re-redeeming when the signed-in user
 * already carries matching portal claims AND the redeem response is cached
 * in sessionStorage (branding only arrives in the redeem response).
 */

import type { IPortalBranding, TRedeemPortalLinkResponse, TWorkspacePlan } from '@siapp/shared';
import { signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { auth, functions } from '@/lib/firebase.ts';

export interface IPortalSession {
  workspaceId: string;
  projectId: string;
  clientId: string;
  branding: IPortalBranding;
  tier: TWorkspacePlan;
}

export type TPortalSessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: IPortalSession }
  | { status: 'not_started'; firmName: string }
  | { status: 'invalid' }
  | { status: 'error' };

const CACHE_KEY = 'siapp.portalSession';

function readCachedSession(): IPortalSession | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<IPortalSession>;
    return typeof parsed.projectId === 'string' &&
      typeof parsed.workspaceId === 'string' &&
      typeof parsed.clientId === 'string' &&
      typeof parsed.branding === 'object' &&
      parsed.branding !== null
      ? (parsed as IPortalSession)
      : null;
  } catch {
    return null;
  }
}

function writeCachedSession(session: IPortalSession): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(session));
  } catch {
    // Private mode / storage quota — session just re-redeems on reload.
  }
}

/** Stable portal error code from an HttpsError's details, or null. */
export function portalErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'details' in error) {
    const details = (error as { details?: unknown }).details;
    if (typeof details === 'object' && details !== null && 'code' in details) {
      const code = (details as { code?: unknown }).code;
      if (typeof code === 'string' && code.startsWith('portal/')) {
        return code;
      }
    }
  }
  return null;
}

export function usePortalSession(token: string | undefined): {
  state: TPortalSessionState;
  retry: () => void;
} {
  const [state, setState] = useState<TPortalSessionState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      if (token === undefined || token === '') {
        setState({ status: 'invalid' });
        return;
      }
      setState({ status: 'loading' });

      // Reuse a live session (page refresh / tab nav) — skip the redeem when
      // the current user's portal claims match the cached redeem response.
      const user = auth.currentUser;
      if (user !== null) {
        const cached = readCachedSession();
        if (cached !== null) {
          const claims = (await user.getIdTokenResult()).claims as {
            portal?: { pid?: unknown };
          };
          if (cancelled) {
            return;
          }
          if (claims.portal?.pid === cached.projectId) {
            setState({ status: 'ready', session: cached });
            return;
          }
        }
      }

      try {
        const redeem = httpsCallable<{ token: string }, TRedeemPortalLinkResponse>(
          functions,
          'redeemPortalLink',
        );
        const response = (await redeem({ token })).data;
        if (cancelled) {
          return;
        }
        if (response.status === 'not_started') {
          setState({ status: 'not_started', firmName: response.firmName });
          return;
        }
        const credential = await signInWithCustomToken(auth, response.customToken);
        const claims = (await credential.user.getIdTokenResult()).claims as {
          portal?: { cid?: unknown };
        };
        const session: IPortalSession = {
          workspaceId: response.workspaceId,
          projectId: response.projectId,
          clientId: typeof claims.portal?.cid === 'string' ? claims.portal.cid : '',
          branding: response.branding,
          tier: response.tier,
        };
        writeCachedSession(session);
        if (!cancelled) {
          setState({ status: 'ready', session });
        }
      } catch (error) {
        if (!cancelled) {
          setState(
            portalErrorCode(error) === 'portal/invalid_or_expired'
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

const PortalSessionContext = createContext<IPortalSession | null>(null);

export const PortalSessionProvider = PortalSessionContext.Provider;

/** The redeemed session — only usable under a ready PortalShell. */
export function usePortalSessionContext(): IPortalSession {
  const session = useContext(PortalSessionContext);
  if (session === null) {
    throw new Error('usePortalSessionContext must be used inside PortalShell');
  }
  return session;
}
