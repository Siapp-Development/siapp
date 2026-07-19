import { signInWithCustomToken } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { auth } from '@/lib/firebase.ts';

/**
 * Relay target for admin impersonation (admin panel, #10).
 *
 * The admin surface cannot hand the minted custom token over via web
 * storage — sessionStorage/localStorage are origin-scoped, and admin and
 * dashboard live on different origins. The token therefore arrives in the
 * URL fragment (never sent to any server) and is stripped from the address
 * bar and history before sign-in.
 */
export function ImpersonatePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', window.location.pathname);
    if (token === null || token === '') {
      setError('Missing impersonation token. Mint a new one from the admin panel.');
      return;
    }
    signInWithCustomToken(auth, token)
      .then(() => navigate('/', { replace: true }))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Impersonation sign-in failed.');
      });
  }, [navigate]);

  if (error !== null) {
    return (
      <main id="main" className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-bold">Impersonation failed</h1>
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      </main>
    );
  }

  return (
    <main id="main" className="px-6 py-16">
      <p role="status" aria-live="polite" className="text-center">
        Signing in as the selected user…
      </p>
    </main>
  );
}
