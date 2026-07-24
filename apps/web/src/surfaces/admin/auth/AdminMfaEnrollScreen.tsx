import { Button, Input, Label } from '@siapp/ui';
import { FirebaseError } from 'firebase/app';
import {
  TotpMultiFactorGenerator,
  multiFactor,
  type TotpSecret,
  type User,
} from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState, type FormEvent } from 'react';

/** sessionStorage flag: enrolment just finished, show a success note on /login. */
export const MFA_ENROLLED_FLAG = 'siapp-admin-mfa-enrolled';

export interface IAdminMfaEnrollScreenProps {
  user: User;
  /** Called after a successful enrolment — signs the user out for re-auth. */
  onEnrolled: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const CODE_RE = /^\d{6}$/;

/**
 * TOTP enrolment for admins without a second factor (#63). Generates a TOTP
 * secret against the current session, shows it as a QR code + manual key,
 * and enrols on code verification. Firebase only stamps
 * `sign_in_second_factor` at sign-in time, so a fresh sign-in is required
 * after enrolment — `onEnrolled` signs the user out.
 */
export function AdminMfaEnrollScreen({ user, onEnrolled, signOutUser }: IAdminMfaEnrollScreenProps) {
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    multiFactor(user)
      .getSession()
      .then((session) => TotpMultiFactorGenerator.generateSecret(session))
      .then((generated) => {
        if (!cancelled) {
          setSecret(generated);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof FirebaseError && error.code === 'auth/requires-recent-login') {
          setSetupError(
            'Your session is too old to enrol a second factor. Sign out, sign in again, and retry.',
          );
        } else {
          setSetupError('Could not start enrolment. Sign out and try again.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (secret === null) {
      return;
    }
    if (!CODE_RE.test(code)) {
      setCodeError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setCodeError(null);
    setPending(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
      await multiFactor(user).enroll(assertion, 'Authenticator app');
      sessionStorage.setItem(MFA_ENROLLED_FLAG, '1');
      await onEnrolled();
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'auth/invalid-verification-code') {
        setCodeError("That code didn't match. Check your authenticator app and try again.");
      } else {
        setCodeError('Enrolment failed. Try again or contact the Siapp team.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main id="main" className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-bold">Set up two-factor authentication</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Admin access requires a second factor (#10). Scan the QR code with an authenticator app
        (Google Authenticator, 1Password, …), then enter the 6-digit code to finish.
      </p>

      {setupError !== null && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {setupError}
        </p>
      )}

      {secret === null && setupError === null && (
        <p role="status" aria-live="polite" className="mt-6 text-sm">
          Generating your secret…
        </p>
      )}

      {secret !== null && (
        <>
          <div className="mt-6 inline-block rounded-md border bg-white p-4">
            <QRCodeSVG
              value={secret.generateQrCodeUrl(user.email ?? 'admin', 'Siapp Admin')}
              size={192}
              aria-label="QR code for authenticator app enrolment"
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Can't scan? Enter this key manually:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {secret.secretKey}
            </code>
          </p>

          <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 max-w-xs space-y-2">
            <Label htmlFor="mfa-enroll-code">6-digit code</Label>
            <Input
              id="mfa-enroll-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={codeError !== null}
              aria-describedby={codeError !== null ? 'mfa-enroll-code-error' : undefined}
            />
            {codeError !== null && (
              <p id="mfa-enroll-code-error" role="alert" className="text-sm text-destructive">
                {codeError}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? 'Verifying…' : 'Verify and enrol'}
            </Button>
          </form>
        </>
      )}

      <Button className="mt-8" variant="outline" onClick={() => void signOutUser()}>
        Sign out
      </Button>
    </main>
  );
}
