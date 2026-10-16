// B7 integration smoke. Requires running local Functions, Firestore, and Hosting emulators.
// Credentials are supplied by the caller, never loaded from a production project.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(new URL('../backend/functions/package.json', import.meta.url));
const twilio = require('twilio');
const projectId = process.env.GCLOUD_PROJECT;
const base = process.env.WA_STATUS_CALLBACK_URL;
const token = process.env.TWILIO_AUTH_TOKEN;
const accountSid = process.env.TWILIO_ACCOUNT_SID;
assert.ok(projectId?.startsWith('demo-'), 'Smoke must use an isolated demo project');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator is required');
assert.ok(
  base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname),
  'Hosting emulator URL required',
);
assert.ok(token && accountSid, 'Local test credentials must be explicitly supplied');

const app = initializeApp({ projectId });
const db = getFirestore(app);
const wid = 'b7-smoke-workspace';
const mid = 'b7-smoke-message';
const messageSid = 'SMlocalB7';
const ref = db.doc(`workspaces/${wid}/messages/${mid}`);
const url = `${base}?${new URLSearchParams({ wid, mid })}`;

async function post(status, expectedCode = 200, invalidSignature = false) {
  const params = { AccountSid: accountSid, MessageSid: messageSid, MessageStatus: status };
  const signature = invalidSignature
    ? 'bad-signature'
    : twilio.getExpectedTwilioSignature(token, url, params);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': signature,
    },
    body: new URLSearchParams(params),
  });
  assert.equal(response.status, expectedCode, `${status} HTTP status: ${await response.text()}`);
  const snapshot = await ref.get();
  console.log(
    JSON.stringify({
      step: invalidSignature ? 'bad-signature' : status,
      http: response.status,
      status: snapshot.get('status'),
      providerStatus: snapshot.get('providerStatus'),
      providerSid: snapshot.get('providerSid'),
      updateTime: snapshot.updateTime.toDate().toISOString(),
    }),
  );
  return snapshot;
}

try {
  await ref.set({ status: 'queued', channel: 'whatsapp', providerSid: '', suppressed: false });
  console.log(JSON.stringify({ step: 'seed', path: ref.path, status: 'queued', projectId }));
  const sent = await post('sent');
  assert.equal(sent.get('status'), 'sent');
  assert.ok(sent.get('sentAt')?.toMillis());
  const delivered = await post('delivered');
  assert.equal(delivered.get('status'), 'delivered');
  assert.ok(delivered.get('deliveredAt')?.toMillis());
  const read = await post('read');
  assert.equal(read.get('status'), 'read');
  assert.equal(read.get('providerSid'), messageSid);
  assert.ok(read.get('readAt')?.toMillis());
  assert.equal(read.get('deliveredAt').toMillis(), delivered.get('deliveredAt').toMillis());
  assert.equal(read.get('sentAt').toMillis(), sent.get('sentAt').toMillis());
  const replay = await post('delivered');
  assert.ok(replay.updateTime.isEqual(read.updateTime), 'Out-of-order replay must not write');
  assert.deepEqual(replay.data(), read.data());
  const duplicate = await post('read');
  assert.ok(duplicate.updateTime.isEqual(read.updateTime), 'Duplicate must not write');
  const rejected = await post('failed', 403, true);
  assert.ok(rejected.updateTime.isEqual(read.updateTime), 'Bad signature must not write');
  const get = await fetch(url);
  assert.equal(get.status, 405);
  console.log(JSON.stringify({ step: 'GET', http: get.status }));
  const spa = await fetch(new URL('/projects/b7-smoke-route', base));
  assert.equal(spa.status, 200);
  assert.match(spa.headers.get('content-type'), /text\/html/);
  assert.match(await spa.text(), /<div id="root"><\/div>/);
  console.log(JSON.stringify({ step: 'apex-SPA-route', http: spa.status }));
  console.log(
    'B7 PASS: signed sent/delivered/read; stale delivered and duplicate read no-write; bad signature 403; GET 405; apex SPA 200',
  );
} finally {
  await ref.delete();
  await deleteApp(app);
}
