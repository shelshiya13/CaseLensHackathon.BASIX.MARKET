import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createExpressApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { getDb } from '../src/db/client.js';

describe('lawyer password reset flow', () => {
  let tempDir = '';
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof createExpressApp>['listen']> | null = null;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caselens-reset-'));
    process.env.DATA_DIR = path.join(tempDir, 'data');
    await runMigrations();

    const app = createExpressApp();
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server?.once('listening', resolve));
    const address = server?.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    const db = await getDb();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('requests and completes a reset for a lawyer account', async () => {
    const email = `reset-${Date.now()}@example.test`;
    const registerResponse = await fetch(`${baseUrl}/api/auth/lawyer/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Reset User', email, password: 'resetpassword123' })
    });
    expect(registerResponse.status).toBe(200);

    const requestResponse = await fetch(`${baseUrl}/api/auth/lawyer/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    expect(requestResponse.status).toBe(200);
    const requestBody = await requestResponse.json();
    expect(requestBody.success).toBe(true);
    expect(requestBody.devCode).toBeTruthy();

    const verifyResponse = await fetch(`${baseUrl}/api/auth/lawyer/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: requestBody.devCode, newPassword: 'brandnewpassword123' })
    });
    expect(verifyResponse.status).toBe(200);
    const verifyBody = await verifyResponse.json();
    expect(verifyBody.success).toBe(true);

    const loginResponse = await fetch(`${baseUrl}/api/auth/lawyer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'brandnewpassword123' })
    });
    expect(loginResponse.status).toBe(200);
  });
});
