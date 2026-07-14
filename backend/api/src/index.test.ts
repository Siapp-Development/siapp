import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

import { createApp } from './index.js';

const app = createApp();

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await supertest(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'siapp-api',
    });
    expect(typeof res.body.timestamp).toBe('string');
  });
});

describe('unknown route', () => {
  it('returns 404', async () => {
    const res = await supertest(app).get('/unknown-route');
    expect(res.status).toBe(404);
  });
});
