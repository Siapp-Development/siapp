import { FirebaseError } from 'firebase/app';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, type Auth } from 'firebase/auth';

/**
 * Popup failures that mean "this browser won't do popups", not "the user
 * changed their mind" — these fall back to the redirect flow. Codes like
 * popup-closed-by-user are deliberate cancellations and must NOT redirect.
 */
const REDIRECT_FALLBACK_CODES: readonly string[] = [
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
];

/**
 * Google sign-in that survives popup blockers (#78). `signInWithPopup` loads
 * the auth iframe before calling `window.open`, so browsers often no longer
 * count the click as a user gesture and block the popup. When that happens we
 * fall back to `signInWithRedirect` — safe here because the auth domain
 * (auth.siapp.app) is same-site with the app domains.
 *
 * When the redirect path is taken this promise resolves after navigation is
 * queued; the result (or an error such as multi-factor-auth-required) is
 * delivered via `getRedirectResult` once the browser returns to the app.
 */
export async function signInWithGoogle(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error instanceof FirebaseError && REDIRECT_FALLBACK_CODES.includes(error.code)) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}
