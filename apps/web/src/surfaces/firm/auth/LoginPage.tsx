import { Alert, Button, Card, CardContent, CardHeader, Input, Label, Separator } from '@siapp/ui';
import { FirebaseError } from 'firebase/app';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';
import { auth } from '@/lib/firebase.ts';
import { useAuth } from './useAuth.ts';

/** Map Firebase Auth error codes to friendly copy; null = dismissed, say nothing. */
function friendlyAuthError(error: unknown): string | null {
  if (!(error instanceof FirebaseError)) {
    return 'Something went wrong. Please try again.';
  }
  switch (error.code) {
    // One generic message for bad email/password — no account enumeration.
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/account-exists-with-different-credential':
      return 'This email uses a different sign-in method. Try the other option.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** Same-app absolute paths only — never an external URL (open-redirect guard). */
function safeNext(raw: string | null): string {
  if (raw !== null && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return '/';
}

interface IFieldErrors {
  email?: string;
  password?: string;
}

/** [A1] Sign-in screen for firm staff at dashboard.siapp.app/login. */
export function LoginPage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<IFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (state.status === 'signedIn') {
    return <Navigate to={next} replace />;
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errors: IFieldErrors = {};
    if (email.trim() === '') {
      errors.email = 'Enter your email address.';
    }
    if (password === '') {
      errors.password = 'Enter your password.';
    }
    setFieldErrors(errors);
    if (errors.email !== undefined || errors.password !== undefined) {
      return;
    }

    setPending(true);
    setFormError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate(next, { replace: true });
    } catch (error) {
      setFormError(friendlyAuthError(error));
      setPending(false);
    }
  }

  async function handleGoogleSignIn(): Promise<void> {
    setPending(true);
    setFormError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate(next, { replace: true });
    } catch (error) {
      setFormError(friendlyAuthError(error));
      setPending(false);
    }
  }

  return (
    <>
      <SkipLink />
      <main id="main" className="flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <h1 className="text-xl font-bold">Sign in to Siapp</h1>
            <p className="text-sm">The dashboard for your firm's workspace.</p>
          </CardHeader>
          <CardContent>
            {formError !== null && (
              <Alert variant="destructive" className="mb-4">
                {formError}
              </Alert>
            )}
            <form onSubmit={handleEmailSignIn} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={fieldErrors.email !== undefined}
                  aria-describedby={fieldErrors.email !== undefined ? 'login-email-error' : undefined}
                />
                {fieldErrors.email !== undefined && (
                  <p id="login-email-error" className="text-sm text-danger">
                    {fieldErrors.email}
                  </p>
                )}
              </div>
              <div className="mt-4 flex flex-col gap-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={fieldErrors.password !== undefined}
                  aria-describedby={
                    fieldErrors.password !== undefined ? 'login-password-error' : undefined
                  }
                />
                {fieldErrors.password !== undefined && (
                  <p id="login-password-error" className="text-sm text-danger">
                    {fieldErrors.password}
                  </p>
                )}
              </div>
              <p className="mt-2 text-right text-sm">
                <Link to="/forgot-password" className="text-primary underline">
                  Forgot password?
                </Link>
              </p>
              <Button
                type="submit"
                className="mt-4 w-full"
                disabled={pending}
                aria-busy={pending}
              >
                {pending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
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
              onClick={() => void handleGoogleSignIn()}
            >
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
