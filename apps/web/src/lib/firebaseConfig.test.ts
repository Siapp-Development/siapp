import { describe, expect, it } from 'vitest';
import { FirebaseConfigError, parseFirebaseConfig, shouldUseEmulators } from './firebaseConfig';

const validEnv = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'test.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456',
  VITE_FIREBASE_APP_ID: '1:123456:web:abc',
};

describe('parseFirebaseConfig', () => {
  it('maps all VITE_FIREBASE_* variables onto the config object', () => {
    expect(parseFirebaseConfig(validEnv)).toEqual({
      apiKey: 'test-api-key',
      authDomain: 'test.firebaseapp.com',
      projectId: 'test-project',
      storageBucket: 'test.firebasestorage.app',
      messagingSenderId: '123456',
      appId: '1:123456:web:abc',
    });
  });

  it('throws a FirebaseConfigError naming every missing variable', () => {
    const env: Record<string, unknown> = { ...validEnv };
    delete env['VITE_FIREBASE_API_KEY'];
    delete env['VITE_FIREBASE_APP_ID'];

    expect(() => parseFirebaseConfig(env)).toThrowError(FirebaseConfigError);
    expect(() => parseFirebaseConfig(env)).toThrowError(
      /VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID/,
    );
  });

  it('treats empty strings as missing', () => {
    const env = { ...validEnv, VITE_FIREBASE_PROJECT_ID: '' };
    expect(() => parseFirebaseConfig(env)).toThrowError(/VITE_FIREBASE_PROJECT_ID/);
  });

  it('rejects non-string values', () => {
    const env = { ...validEnv, VITE_FIREBASE_APP_ID: 42 };
    expect(() => parseFirebaseConfig(env)).toThrowError(/VITE_FIREBASE_APP_ID/);
  });
});

describe('shouldUseEmulators', () => {
  it('is true only when dev mode and the flag are both set', () => {
    expect(shouldUseEmulators({ VITE_USE_EMULATORS: 'true' }, true)).toBe(true);
  });

  it('is false in production builds even if the flag is set', () => {
    expect(shouldUseEmulators({ VITE_USE_EMULATORS: 'true' }, false)).toBe(false);
  });

  it('is false when the flag is absent or not the string "true"', () => {
    expect(shouldUseEmulators({}, true)).toBe(false);
    expect(shouldUseEmulators({ VITE_USE_EMULATORS: 'false' }, true)).toBe(false);
    expect(shouldUseEmulators({ VITE_USE_EMULATORS: true }, true)).toBe(false);
  });
});
