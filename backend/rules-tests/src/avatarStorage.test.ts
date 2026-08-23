/**
 * #104 avatar storage rules: `avatars/{uid}/{fileName}`.
 *
 * - Reads are signed-in-wide (any authenticated user may render another user's
 *   avatar — an accepted low-sensitivity tradeoff), but unauthenticated reads
 *   are denied.
 * - Create is owner-only, capped at MAX_AVATAR_SIZE_BYTES with the shared mime
 *   allowlist; oversize / disallowed mime / non-owner writes are denied.
 * - Delete is owner-only (so "remove photo" frees bytes); others denied.
 * - Size/mime constants must stay in parity with @siapp/shared.
 */

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { AVATAR_ALLOWED_MIME_TYPES, MAX_AVATAR_SIZE_BYTES } from '@siapp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStorageTestEnv } from './helpers.ts';

const ADA = 'ada';
const BOB = 'bob';
const ADA_AVATAR = `avatars/${ADA}/photo.png`;

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createStorageTestEnv('siapp-rules-avatars');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(ADA_AVATAR).put(PNG_BYTES, { contentType: 'image/png' });
  });
});

afterAll(async () => {
  await testEnv.clearStorage();
  await testEnv.cleanup();
});

function storageAs(uid: string) {
  return testEnv.authenticatedContext(uid, {}).storage();
}

// The compat SDK's put() returns an UploadTask (thenable, not a Promise).
function put(
  storage: ReturnType<typeof storageAs>,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<unknown> {
  return Promise.resolve(storage.ref(path).put(bytes, { contentType }));
}

describe('avatar reads', () => {
  it('lets any signed-in user read another user’s avatar (cross-user requirement)', async () => {
    await assertSucceeds(storageAs(BOB).ref(ADA_AVATAR).getDownloadURL());
  });

  it('lets the owner read their own avatar', async () => {
    await assertSucceeds(storageAs(ADA).ref(ADA_AVATAR).getDownloadURL());
  });

  it('denies unauthenticated reads', async () => {
    await assertFails(
      testEnv.unauthenticatedContext().storage().ref(ADA_AVATAR).getDownloadURL(),
    );
  });
});

describe('avatar create', () => {
  it('lets the owner upload every allowed mime type within the size cap', async () => {
    for (const [index, mimeType] of AVATAR_ALLOWED_MIME_TYPES.entries()) {
      await assertSucceeds(
        put(storageAs(ADA), `avatars/${ADA}/ok-${index}`, PNG_BYTES, mimeType),
      );
    }
  });

  it('denies uploading to another user’s avatar prefix', async () => {
    await assertFails(put(storageAs(BOB), `avatars/${ADA}/hijack.png`, PNG_BYTES, 'image/png'));
  });

  it('denies unauthenticated uploads', async () => {
    await assertFails(
      Promise.resolve(
        testEnv
          .unauthenticatedContext()
          .storage()
          .ref(`avatars/${ADA}/anon.png`)
          .put(PNG_BYTES, { contentType: 'image/png' }),
      ),
    );
  });

  it('denies an over-cap upload (> MAX_AVATAR_SIZE_BYTES)', async () => {
    await assertFails(
      put(
        storageAs(ADA),
        `avatars/${ADA}/huge.png`,
        new Uint8Array(MAX_AVATAR_SIZE_BYTES + 1),
        'image/png',
      ),
    );
  });

  it('denies disallowed content types (svg, gif)', async () => {
    for (const contentType of ['image/svg+xml', 'image/gif']) {
      await assertFails(
        put(storageAs(ADA), `avatars/${ADA}/bad`, PNG_BYTES, contentType),
      );
    }
  });
});

describe('avatar delete', () => {
  it('lets the owner delete their own avatar', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .storage()
        .ref(`avatars/${ADA}/deletable.png`)
        .put(PNG_BYTES, { contentType: 'image/png' });
    });

    await assertSucceeds(storageAs(ADA).ref(`avatars/${ADA}/deletable.png`).delete());
  });

  it('denies another user deleting someone else’s avatar', async () => {
    await assertFails(storageAs(BOB).ref(ADA_AVATAR).delete());
  });
});

describe('rules ↔ shared parity', () => {
  it('matches the size cap hard-coded in storage.rules (5 MB)', () => {
    expect(MAX_AVATAR_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });

  it('matches the mime allowlist hard-coded in storage.rules', () => {
    expect([...AVATAR_ALLOWED_MIME_TYPES]).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  });
});
