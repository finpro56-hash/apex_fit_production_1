/**
 * Apex Fit — Authentication & Authorization Security Test Suite
 *
 * Covers:
 * 1. A valid Firebase ID token.
 * 2. A missing token.
 * 3. An invalid token.
 * 4. An expired token.
 * 5. Firebase Admin verification failure.
 * 6. Attempts to access another user's data (identity derivation & ownership).
 * 7. Legitimate guest functionality.
 * 8. Guest attempts to access protected endpoints.
 * 9. Unauthorized access to each sensitive AI or data endpoint.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createApp } from '../server/app.js';
import {
  requireAuth,
  requireVerifiedUser,
  setTokenVerifierForTesting,
  verifyFirebaseIdToken,
  AuthError,
} from '../server/auth.js';

describe('Apex Fit Security & Authentication Suite', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    app = createApp();

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    setTokenVerifierForTesting(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    setTokenVerifierForTesting(null);
  });

  // TEST 1: Valid Firebase ID token
  test('1. Valid Firebase ID token is accepted and derives identity strictly from token', async () => {
    setTokenVerifierForTesting(async (token) => {
      if (token === 'valid_firebase_token_user123') {
        return { uid: 'usr_verified_123', email: 'athlete@example.com' };
      }
      throw new Error('Unexpected token');
    });

    const res = await fetch(`${baseUrl}/api/calculate-nutrition-goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_firebase_token_user123',
      },
      body: JSON.stringify({
        heightCm: 180,
        weightKg: 80,
        age: 30,
        sex: 'male',
        activityLevel: 'moderate',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.maintenanceCalories > 0);
  });

  // TEST 2: Missing token
  test('2. Missing token is rejected with HTTP 401', async () => {
    const res = await fetch(`${baseUrl}/api/calculate-nutrition-goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heightCm: 180, weightKg: 80, age: 30, sex: 'male' }),
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Authentication required');
  });

  // TEST 3: Invalid token
  test('3. Invalid token is rejected with HTTP 401 and never falls back to an authenticated user', async () => {
    setTokenVerifierForTesting(async () => {
      const err = new Error('Decoding Firebase ID token failed');
      (err as any).code = 'auth/invalid-id-token';
      throw err;
    });

    const res = await fetch(`${baseUrl}/api/calculate-nutrition-goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer forged_or_corrupt_token',
      },
      body: JSON.stringify({ heightCm: 180, weightKg: 80, age: 30, sex: 'male' }),
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Invalid authentication token.');
  });

  // TEST 4: Expired token
  test('4. Expired token is rejected with HTTP 401 with session expired notice', async () => {
    setTokenVerifierForTesting(async () => {
      const err = new Error('Firebase ID token has expired');
      (err as any).code = 'auth/id-token-expired';
      throw err;
    });

    const res = await fetch(`${baseUrl}/api/calculate-nutrition-goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer expired_user_token',
      },
      body: JSON.stringify({ heightCm: 180, weightKg: 80, age: 30, sex: 'male' }),
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Session expired. Please sign in again.');
  });

  // TEST 5: Firebase Admin verification failure
  test('5. Firebase Admin verification failure fails closed with HTTP 401 without authorizing', async () => {
    setTokenVerifierForTesting(async () => {
      throw new Error('Failed to reach Google token verification authority (network down)');
    });

    const res = await fetch(`${baseUrl}/api/calculate-nutrition-goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer some_unverifiable_token',
      },
      body: JSON.stringify({ heightCm: 180, weightKg: 80, age: 30, sex: 'male' }),
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, 'Authentication verification failed. Please sign in again.');
  });

  // TEST 6: Attempts to access another user's data (identity derivation)
  test('6. Never trusts client-provided userId: identity is strictly derived from token', async () => {
    setTokenVerifierForTesting(async (token) => {
      if (token === 'victim_token') return { uid: 'victim_real_id', email: 'victim@example.com' };
      if (token === 'attacker_token') return { uid: 'attacker_real_id', email: 'attacker@example.com' };
      throw new Error('Invalid');
    });

    // Test privileged route: attacker tries to claim they are victim in query or headers
    const res = await fetch(`${baseUrl}/api/auth/verify?userId=victim_real_id`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer attacker_token',
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.uid, 'attacker_real_id'); // Derived strictly from verified token, ignoring query/params!
    assert.notEqual(data.uid, 'victim_real_id');
  });

  // TEST 7: Legitimate guest functionality
  test('7. Legitimate guest functionality works with isolated IP-scoped identity', async () => {
    const res = await fetch(`${baseUrl}/api/calculate-nutrition-goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer guest_session',
      },
      body: JSON.stringify({
        heightCm: 175,
        weightKg: 75,
        age: 28,
        sex: 'female',
        activityLevel: 'moderate',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.maintenanceCalories > 0);
  });

  // TEST 8: Guest attempts to access protected endpoints
  test('8. Guest token is rejected with HTTP 403 on privileged endpoints and invalid guest tokens return 401', async () => {
    // 8a. Legitimate guest token on strictly verified endpoint -> 403 Forbidden
    const resForbidden = await fetch(`${baseUrl}/api/auth/verify`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer guest_session',
      },
    });
    assert.equal(resForbidden.status, 403);
    const dataForbidden = await resForbidden.json();
    assert.equal(dataForbidden.error, 'This action requires a signed-in account.');

    // 8b. Forged or unapproved guest prefix tokens (e.g. 'guest_attacker', 'guest') -> 401 Unauthorized
    setTokenVerifierForTesting(async () => {
      const err = new Error('Invalid token');
      (err as any).code = 'auth/invalid-id-token';
      throw err;
    });

    const resForged = await fetch(`${baseUrl}/api/calculate-nutrition-goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer guest_attacker',
      },
      body: JSON.stringify({ heightCm: 180, weightKg: 80, age: 30, sex: 'male' }),
    });
    assert.equal(resForged.status, 401);
  });

  // TEST 9: Unauthorized access to each sensitive AI endpoint
  test('9. Unauthorized access to all sensitive endpoints is rejected with HTTP 401', async () => {
    const endpoints = [
      { path: '/api/analyze-food-photo', body: { imageBase64: 'abc', mimeType: 'image/jpeg' } },
      { path: '/api/extract-food-text', body: { text: '2 eggs and toast' } },
      { path: '/api/estimate-food', body: { foodName: 'Banana', quantity: '1 medium' } },
      { path: '/api/calculate-nutrition-goals', body: { heightCm: 175, weightKg: 75, age: 28, sex: 'male' } },
      { path: '/api/ai-chat', body: { message: 'How do I improve my cardio?' } },
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep.body),
      });

      assert.equal(res.status, 401, `Expected 401 on unauthenticated ${ep.path}, got ${res.status}`);
      const data = await res.json();
      assert.equal(data.error, 'Authentication required');
    }
  });

  // TEST 10: Unknown API endpoints return clean JSON 404 responses
  test('10. Unknown API endpoints (/api and /api/unknown) return JSON 404 responses', async () => {
    const resUnknown = await fetch(`${baseUrl}/api/non-existent-endpoint`);
    assert.equal(resUnknown.status, 404);
    const dataUnknown = await resUnknown.json();
    assert.equal(dataUnknown.error, 'API endpoint not found');

    const resRootApi = await fetch(`${baseUrl}/api`);
    assert.equal(resRootApi.status, 404);
    const dataRootApi = await resRootApi.json();
    assert.equal(dataRootApi.error, 'API endpoint not found');
  });

  // TEST 11: CORS preflight request handling
  test('11. OPTIONS preflight requests to /api return 204 with CORS headers', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://apex-fit.vercel.app',
        'Access-Control-Request-Method': 'POST',
      },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://apex-fit.vercel.app');
  });

  // TEST 12: api/index.ts Vercel adapter export
  test('12. api/index.ts exports a valid Express application instance', async () => {
    const vercelAdapter = await import('../api/index.js');
    assert.ok(vercelAdapter.default);
    assert.equal(typeof vercelAdapter.default, 'function');
  });
});
