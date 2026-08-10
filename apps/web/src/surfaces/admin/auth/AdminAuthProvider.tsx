import type { IWorkspaceClaims } from '@siapp/shared';
import { FirebaseError } from 'firebase/app';
import {
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  getRedirectResult,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type MultiFactorError,
  type MultiFactorResolver,
  type User,
} from 'firebase/auth';
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { auth } from '@/lib/firebase.ts';
import { shouldUseEmulators } from '@/lib/firebaseConfig';
import { signInWithGoogle } from '@/lib/googleSignIn.ts';

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
  signInWithPassword: (email: string, password: string) => Promise<void>;
  sendForgotPasswordEmail: (email: string) => Promise<void>;
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
 * Sign-in requires the `isAdmin` custom claim and (outside the emulator) a
 * second-factor signal on the ID token — #10/#94 keep MFA + claims gating.
 */
export function AdminAuthProvider({ children }: IAdminAuthProviderProps) {
  const [state, setState] = useState<TAdminAuthState>({ status: 'loading' });

  // When the popup was blocked, sign-in falls back to the redirect flow (#78);
  // an MFA-enrolled account then surfaces its challenge here on return
  // instead of in the signInWithGoogle catch below.
  useEffect(() => {
    getRedirectResult(auth).catch((error: unknown) => {
      if (error instanceof FirebaseError && error.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, error as MultiFactorError);
        setState({ status: 'mfaChallenge', resolver });
      }
      // Other redirect errors leave the signed-out screen in place.
    });
  }, []);

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
        try {
          await signInWithGoogle(auth);
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
      signInWithPassword: async (email: string, password: string) => {
        try {
          await signInWithEmailAndPassword(auth, email, password);
          // onIdTokenChanged will update state automatically.
        } catch (error) {
          if (error instanceof FirebaseError && error.code === 'auth/multi-factor-auth-required') {
            const resolver = getMultiFactorResolver(auth, error as MultiFactorError);
            setState({ status: 'mfaChallenge', resolver });
            return;
          }
          throw error;
        }
      },
      sendForgotPasswordEmail: async (email: string) => {
        await sendPasswordResetEmail(auth, email);
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
