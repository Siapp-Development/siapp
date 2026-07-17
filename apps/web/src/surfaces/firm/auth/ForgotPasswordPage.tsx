import { Alert, Button, Card, CardContent, CardHeader, Input, Label } from '@siapp/ui';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { SkipLink } from '@/components/SkipLink.tsx';
import { auth } from '@/lib/firebase.ts';

/** Password reset request — Firebase built-in reset email (D-040). */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (email.trim() === '') {
      setFieldError('Enter your email address.');
      return;
    }
    setFieldError(null);
    setPending(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch {
      // Deliberately swallowed: the confirmation below must never reveal
      // whether an account exists (no user enumeration), so every outcome
      // shows the same copy.
    } finally {
      setPending(false);
      setSent(true);
    }
  }

  return (
    <>
      <SkipLink />
      <main id="main" className="flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <h1 className="text-xl font-bold">Reset your password</h1>
            <p className="text-sm">We'll email you a link to choose a new password.</p>
          </CardHeader>
          <CardContent>
            {sent && (
              <Alert variant="success" role="status" className="mb-4">
                If that account exists, a password reset email has been sent.
              </Alert>
            )}
            <form onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={fieldError !== null}
                  aria-describedby={fieldError !== null ? 'reset-email-error' : undefined}
                />
                {fieldError !== null && (
                  <p id="reset-email-error" className="text-sm text-danger">
                    {fieldError}
                  </p>
                )}
              </div>
              <Button type="submit" className="mt-4 w-full" disabled={pending} aria-busy={pending}>
                {pending ? 'Sending…' : 'Send reset email'}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm">
              <Link to="/login" className="text-primary underline">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
