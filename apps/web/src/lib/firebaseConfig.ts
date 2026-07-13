export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export class FirebaseConfigError extends Error {
  constructor(missingKeys: readonly string[]) {
    super(
      `Missing Firebase environment variables: ${missingKeys.join(', ')}. ` +
        'Copy .env.example to .env.local and fill in the values.',
    );
    this.name = 'FirebaseConfigError';
  }
}

const ENV_KEY_MAP = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const satisfies Record<keyof FirebaseWebConfig, string>;

export function parseFirebaseConfig(env: Record<string, unknown>): FirebaseWebConfig {
  const missing: string[] = [];
  const config: Partial<Record<keyof FirebaseWebConfig, string>> = {};

  for (const [field, envKey] of Object.entries(ENV_KEY_MAP) as [
    keyof FirebaseWebConfig,
    string,
  ][]) {
    const value = env[envKey];
    if (typeof value === 'string' && value.length > 0) {
      config[field] = value;
    } else {
      missing.push(envKey);
    }
  }

  if (missing.length > 0) {
    throw new FirebaseConfigError(missing);
  }

  return config as FirebaseWebConfig;
}

export function shouldUseEmulators(env: Record<string, unknown>, isDev: boolean): boolean {
  return isDev && env['VITE_USE_EMULATORS'] === 'true';
}
