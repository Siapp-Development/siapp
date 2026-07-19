/**
 * One-time script to grant `isAdmin: true` custom claim to a Siapp admin account.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   node --loader ts-node/esm setAdminClaim.ts <email>
 *
 * Or with ts-node directly:
 *   GOOGLE_APPLICATION_CREDENTIALS=... ts-node --esm setAdminClaim.ts <email>
 *
 * Prerequisites:
 *   - A service account with the "Firebase Authentication Admin" role.
 *   - GOOGLE_APPLICATION_CREDENTIALS pointing to the service-account JSON.
 *
 * The script is idempotent — running it twice on the same account is safe.
 * The account must sign out and back in (or wait ≤1h) for the new claim to
 * be reflected in ID tokens already in use.
 */

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [, , email] = process.argv;

if (email === undefined || email.trim() === '') {
  process.stderr.write('Usage: ts-node setAdminClaim.ts <email>\n');
  process.exit(1);
}

initializeApp();
const auth = getAuth();

const user = await auth.getUserByEmail(email.trim());
const existing = (user.customClaims ?? {}) as Record<string, unknown>;
await auth.setCustomUserClaims(user.uid, { ...existing, isAdmin: true });
process.stdout.write(`✓ isAdmin set on ${user.uid} (${String(user.email)})\n`);
