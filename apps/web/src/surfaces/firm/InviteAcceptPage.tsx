/**
 * Invite acceptance at /invite/:workspaceId/:inviteId/:token (#11) — lives
 * outside RequireAuth because the recipient usually has no account yet.
 *
 * Signed-out visitors sign in OR create an account inline (this is the only
 * self-serve signup surface — the dashboard's login page deliberately has
 * none). Password signups must verify their email before the server will
 * accept the invite ('invite/email-unverified'), which blocks pre-registered
 * lookalike accounts from hijacking an invite.
 */

import { Alert, Button, Card, CardContent, CardHeader, Input, Label, Separator } from '@siapp/ui';
import { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';
import { acceptInvite, inviteErrorCode } from '@/lib/callables.ts';
import { auth } from '@/lib/firebase.ts';
import { useAuth } from './auth/useAuth.ts';

const ERROR_MESSAGES: Record<string, string> = {
  'invite/not-found': 'This invite link is invalid. Check the link or ask for a new invite.',
  'invite/expired': 'This invite has expired. Ask a workspace admin to send a new one.',
  'invite/revoked': 'This invite was revoked by a workspace admin.',
  'invite/already-used': 'This invite has already been used.',
  'invite/email-mismatch':
    'This invite was sent to a different email address. Sign in with the invited account.',
  'invite/already-member': 'You are already a member of this workspace.',
  'invite/already-in-workspace':
    'Your account already belongs to a workspace — Siapp currently supports one workspace per account.',
};

function friendlyAuthError(error: unknown): string | null {
  if (!(error instanceof FirebaseError)) {
    return 'Something went wrong. Please try again.';
  }
  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Choose a password with at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <main id="main" className="flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">{children}</Card>
      </main>
    </>
  );
}

type TAuthMode = 'signIn' | 'signUp';

function SignInCard() {
  const [mode, setMode] = useState<TAuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (email.trim() === '' || password === '') {
      setFormError('Enter your email and password.');
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      if (mode === 'signIn') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        // Bring the verification link back to this invite.
        await sendEmailVerification(credential.user, { url: window.location.href }).catch(
          () => undefined,
        );
      }
      // AuthProvider flips to signedIn and the accept flow takes over.
    } catch (error) {
      setFormError(friendlyAuthError(error));
      setPending(false);
    }
  }

  async function handleGoogle(): Promise<void> {
    setPending(true);
    setFormError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setFormError(friendlyAuthError(error));
      setPending(false);
    }
  }

  return (
    <>
      <CardHeader>
        <h1 className="text-xl font-bold">Join your team on Siapp</h1>
        <p className="text-sm">
          {mode === 'signIn'
            ? 'Sign in with the account this invite was sent to.'
            : 'Create an account with the email this invite was sent to.'}
        </p>
      </CardHeader>
      <CardContent>
        {formError !== null && (
          <Alert variant="destructive" className="mb-4">
            {formError}
          </Alert>
        )}
        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-auth-email">Email</Label>
            <Input
              id="invite-auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor="invite-auth-password">Password</Label>
            <Input
              id="invite-auth-password"
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button type="submit" className="mt-4 w-full" disabled={pending} aria-busy={pending}>
            {pending
              ? 'Please wait…'
              : mode === 'signIn'
                ? 'Sign in and join'
                : 'Create account and join'}
          </Button>
        </form>
        <p className="mt-3 text-center text-sm">
          {mode === 'signIn' ? (
            <>
              New to Siapp?{' '}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => setMode('signUp')}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => setMode('signIn')}
              >
                Sign in
              </button>
            </>
          )}
        </p>
        <div className="my-4 flex items-center gap-3">
          <Separator className="flex-1 basis-0" />
          <span className="text-sm" aria-hidden="true">
            or
          </span>
          <Separator className="flex-1 basis-0" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={() => void handleGoogle()}
        >
          Continue with Google
        </Button>
      </CardContent>
    </>
  );
}

type TAcceptPhase =
  | { kind: 'accepting' }
  | { kind: 'error'; code: string | null }
  | { kind: 'done' };

export function InviteAcceptPage() {
  const { workspaceId, inviteId, token } = useParams<'workspaceId' | 'inviteId' | 'token'>();
  const { state, signOutUser } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<TAcceptPhase>({ kind: 'accepting' });
  const [verificationSent, setVerificationSent] = useState(false);
  const attemptedFor = useRef<string | null>(null);

  const uid = state.status === 'signedIn' ? state.user.uid : null;
  const linkValid =
    typeof workspaceId === 'string' && typeof inviteId === 'string' && typeof token === 'string';

  async function runAccept(): Promise<void> {
    if (!linkValid) {
      return;
    }
    setPhase({ kind: 'accepting' });
    try {
      const result = await acceptInvite({
        workspaceId: workspaceId,
        inviteId: inviteId,
        token: token,
      });
      setPhase({ kind: 'done' });
      // Claims were set server-side; force a token refresh so the shell
      // recognises the new workspace before we land on it.
      await auth.currentUser?.getIdToken(true);
      navigate(`/${result.workspaceSlug}`, { replace: true });
    } catch (error) {
      setPhase({ kind: 'error', code: inviteErrorCode(error) });
    }
  }

  useEffect(() => {
    if (uid === null || !linkValid || attemptedFor.current === uid) {
      return;
    }
    attemptedFor.current = uid;
    void runAccept();
    // runAccept is stable per render inputs; the ref gates re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, linkValid]);

  if (!linkValid) {
    return (
      <PageFrame>
        <CardHeader>
          <h1 className="text-xl font-bold">Invalid invite link</h1>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{ERROR_MESSAGES['invite/not-found']}</p>
        </CardContent>
      </PageFrame>
    );
  }

  if (state.status === 'loading') {
    return (
      <PageFrame>
        <CardContent className="py-10">
          <p role="status" aria-live="polite" className="text-center">
            Loading…
          </p>
        </CardContent>
      </PageFrame>
    );
  }

  if (state.status === 'signedOut') {
    return (
      <PageFrame>
        <SignInCard />
      </PageFrame>
    );
  }

  if (phase.kind === 'error' && phase.code === 'invite/email-unverified') {
    return (
      <PageFrame>
        <CardHeader>
          <h1 className="text-xl font-bold">Verify your email</h1>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            To accept this invite, verify <strong>{state.user.email}</strong> first. Check your
            inbox for a verification link, then come back here.
          </p>
          {verificationSent && <Alert className="mt-3">Verification email sent.</Alert>}
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => {
                void (async () => {
                  await state.user.reload();
                  await state.user.getIdToken(true);
                  await runAccept();
                })();
              }}
            >
              I've verified — try again
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void sendEmailVerification(state.user, { url: window.location.href }).then(() =>
                  setVerificationSent(true),
                );
              }}
            >
              Resend verification email
            </Button>
          </div>
        </CardContent>
      </PageFrame>
    );
  }

  if (phase.kind === 'error') {
    const message =
      (phase.code !== null ? ERROR_MESSAGES[phase.code] : undefined) ??
      'The invite could not be accepted. Please try again.';
    return (
      <PageFrame>
        <CardHeader>
          <h1 className="text-xl font-bold">Unable to join workspace</h1>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">{message}</Alert>
          <div className="mt-4 flex flex-col gap-2">
            {phase.code === 'invite/email-mismatch' && (
              <Button type="button" variant="outline" onClick={() => void signOutUser()}>
                Sign in with a different account
              </Button>
            )}
            {(phase.code === 'invite/already-member' ||
              phase.code === 'invite/already-in-workspace') && (
              <Button type="button" onClick={() => navigate('/')}>
                Go to your workspace
              </Button>
            )}
            {phase.code === null && (
              <Button type="button" onClick={() => void runAccept()}>
                Try again
              </Button>
            )}
          </div>
        </CardContent>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <CardContent className="py-10">
        <p role="status" aria-live="polite" className="text-center">
          {phase.kind === 'done' ? 'Joined! Taking you to your workspace…' : 'Joining workspace…'}
        </p>
      </CardContent>
    </PageFrame>
  );
}
