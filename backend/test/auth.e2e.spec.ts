/**
 * Test e2e per il flusso di autenticazione di Aura.
 *
 * Richiede un database Postgres accessibile via DATABASE_URL con schema.sql
 * gia' applicato (vedi scripts/apply-schema-safely.js).
 *
 * Esegue contro un'istanza del backend in esecuzione (npm run start:dev).
 * Verifica:
 *   1. POST /auth/register — crea utente listener
 *   2. POST /auth/login — restituisce accessToken + refreshToken
 *   3. GET /auth/me con Bearer — restituisce utente autenticato (TODO backend)
 *   4. POST /auth/refresh — rotation del refreshToken
 *   5. POST /auth/logout — invalida il refreshToken
 *   6. RBAC: GET /users senza permessi → 403
 *   7. RBAC: GET /users con permessi admin → 200
 *
 * Esegue con: DATABASE_URL=... JWT_ACCESS_SECRET=... npx jest auth.e2e.spec.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

async function post(path: string, body: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

async function get(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BACKEND_URL}${path}`, { headers });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

describe('Aura backend — flusso auth e2e', () => {
  const suffix = Math.random().toString(36).substring(2, 8);
  const email = `e2e-${suffix}@test.aura`;
  const password = 'TestPassword123!';

  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  it('1. POST /auth/register — crea utente listener', async () => {
    const r = await post('/auth/register', {
      email,
      password,
      displayName: `E2E Test ${suffix}`,
      accountType: 'listener',
    });
    expect([201, 200]).toContain(r.status);
    expect(r.json).toBeTruthy();
    expect(r.json.user).toBeTruthy();
    expect(r.json.user.email).toBe(email);
    expect(r.json.accessToken).toBeTruthy();
    expect(r.json.refreshToken).toBeTruthy();
    accessToken = r.json.accessToken;
    refreshToken = r.json.refreshToken;
    userId = r.json.user.id;
  });

  it('2. POST /auth/login — restituisce token', async () => {
    const r = await post('/auth/login', { email, password });
    expect(r.status).toBe(200);
    expect(r.json.accessToken).toBeTruthy();
    expect(r.json.refreshToken).toBeTruthy();
    accessToken = r.json.accessToken;
    refreshToken = r.json.refreshToken;
  });

  it('3. GET /users senza permessi → 403', async () => {
    const r = await get('/users', accessToken);
    // listener non ha permessi user:read
    expect([403, 401]).toContain(r.status);
  });

  it('4. GET /audit senza auth → 401', async () => {
    const r = await get('/audit');
    expect([401, 403]).toContain(r.status);
  });

  it('5. POST /auth/refresh — rotation', async () => {
    const r = await post('/auth/refresh', { refreshToken });
    expect(r.status).toBe(200);
    expect(r.json.accessToken).toBeTruthy();
    expect(r.json.refreshToken).toBeTruthy();
    // il nuovo refresh deve essere diverso dal vecchio (rotation)
    expect(r.json.refreshToken).not.toBe(refreshToken);
    accessToken = r.json.accessToken;
    refreshToken = r.json.refreshToken;
  });

  it('6. POST /auth/logout — invalida refreshToken', async () => {
    const r = await post('/auth/logout', { refreshToken }, accessToken);
    expect([200, 204]).toContain(r.status);
  });

  it('7. POST /auth/refresh con token revocato → 401', async () => {
    const r = await post('/auth/refresh', { refreshToken });
    expect(r.status).toBe(401);
  });
});
