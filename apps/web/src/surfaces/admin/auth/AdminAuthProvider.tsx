import type { IWorkspaceClaims } from '@siapp/shared';
import { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type MultiFactorError,
  type MultiFactorResolver,
  type User,
} from 'firebase/auth';
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { auth } from '@/lib/firebase.ts';
import { shouldUseEmulators } from '@/lib/firebaseConfig';

export type TAdminAuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'notAdmin'; user: User }
  | { status: 'mfaRequired'; user: User }
  | { status: 'mfaChallenge'; resolver: MultiFactorResolver }
  | { status: 'signedIn'; user: User };

export interface IAdminAuthContextValue {
  state: TAdminAuthState;
  signInWithGoogle: () => Promise<void>;
  /** Resolve a pending TOTP challenge with a 6-digit authenticator code. */
  completeMfaSignIn: (code: string) => Promise<void>;
  /** Abandon a pending TOTP challenge and return to signed-out. */
  cancelMfaChallenge: () => void;
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
        try {
          await signInWithPopup(auth, provider);
          // onIdTokenChanged will update state automatically.
        } catch (error) {
          // An MFA-enrolled account must resolve a second-factor challenge
          // before the sign-in completes (#63).
          if (error instanceof FirebaseError && error.code === 'auth/multi-factor-auth-required') {
            const resolver = getMultiFactorResolver(auth, error as MultiFactorError);
            setState({ status: 'mfaChallenge', resolver });
            return;
          }
          throw error;
        }
      },
      completeMfaSignIn: async (code: string) => {
        if (state.status !== 'mfaChallenge') {
          throw new Error('No MFA challenge in progress');
        }
        const hint = state.resolver.hints.find(
          (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
        );
        if (hint === undefined) {
          throw new Error('No authenticator app is enrolled for this account');
        }
        const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code);
        await state.resolver.resolveSignIn(assertion);
        // onIdTokenChanged will update state automatically.
      },
      cancelMfaChallenge: () => {
        setState({ status: 'signedOut' });
      },
      signOutUser: async () => {
        await signOut(auth);
      },
    }),
    [state],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}
