import { setGlobalOptions } from 'firebase-functions/v2';

// Co-locate compute with the Firestore database (asia-southeast1, D-002).
// Must be the FIRST import in index.ts: ES module imports are hoisted, so
// callables registered inside imported modules (e.g. callables/invites.ts)
// would otherwise run before setGlobalOptions and default to us-central1.
setGlobalOptions({ region: 'asia-southeast1' });
