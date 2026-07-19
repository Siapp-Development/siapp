import type { IWorkspaceClaims } from '@siapp/shared';
import { GoogleAuthProvider, onIdTokenChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { auth } from '@/lib/firebase.ts';
import { shouldUseEmulators } from '@/lib/firebaseConfig';

export type TAdminAuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'notAdmin'; user: User }
  | { status: 'mfaRequired'; user: User }
  | { status: 'signedIn'; user: User };

export interface IAdminAuthContextValue {
  state: TAdminAuthState;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

export const AdminAuthContext = createContext<IAdminAuthContextValue | null>(null);

export interface IAdminAuthProviderProps {
  children: ReactNode;
}

/**
 * Auth provider for the Siapp admin surface.
 * Google sign-in only; requires the `isAdmin` custom claim and (outside the
 * emulator) a second-factor signal on the ID token — #10 mandates SSO + MFA.
 */
export function AdminAuthProvider({ children }: IAdminAuthProviderProps) {
  const [state, setState] = useState<TAdminAuthState>({ status: 'loading' });

  useEffect(() => {
    return onIdTokenChanged(auth, (user) => {
      if (user === null) {
        setState({ status: 'signedOut' });
        return;
      }
      user
        .getIdTokenResult()
        .then((result) => {
          const claims = result.claims as unknown as Partial<IWorkspaceClaims> & {
            firebase?: { sign_in_second_factor?: string };
          };
          if (claims.isAdmin !== true) {
            setState({ status: 'notAdmin', user });
            return;
          }
          const usedSecondFactor =
            typeof claims.firebase?.sign_in_second_factor === 'string' &&
            claims.firebase.sign_in_second_factor !== '';
          // The emulator cannot complete an MFA sign-in, so only enforce
          // outside it — mirrors assertAdminCall on the backend.
          if (!usedSecondFactor && !shouldUseEmulators(import.meta.env, import.meta.env.DEV)) {
            setState({ status: 'mfaRequired', user });
            return;
          }
          setState({ status: 'signedIn', user });
        })
        .catch(() => {
          setState({ status: 'notAdmin', user });
        });
    });
  }, []);

  const value = useMemo<IAdminAuthContextValue>(
    () => ({
      state,
      signInWithGoogle: async () => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        // onIdTokenChanged will update state automatically.
      },
      signOutUser: async () => {
        await signOut(auth);
      },
    }),
    [state],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}
