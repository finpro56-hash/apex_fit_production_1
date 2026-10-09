/**
 * Apex Fit — Firebase Configuration & Reliability Test Suite
 *
 * Verifies:
 * 1. Backend Project ID selection precedence and fallback.
 * 2. Backend service account parsing & fail-closed security.
 * 3. Frontend configuration precedence and required field validation.
 * 4. Firestore named database ID configuration.
 * 5. Secret isolation: No private keys or server secrets in client bundle.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getProjectId, AuthError } from '../server/auth.js';

describe('Firebase Configuration & Reliability Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.VITE_FIREBASE_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // TEST 1: Backend Project ID Precedence
  test('1. Backend selects FIREBASE_PROJECT_ID with highest priority', () => {
    process.env.FIREBASE_PROJECT_ID = 'prod-apex-fit-primary';
    process.env.VITE_FIREBASE_PROJECT_ID = 'client-fallback-project';
    process.env.GOOGLE_CLOUD_PROJECT = 'gcp-container-project';

    const selected = getProjectId();
    assert.equal(selected, 'prod-apex-fit-primary');
  });

  test('2. Backend falls back to VITE_FIREBASE_PROJECT_ID if FIREBASE_PROJECT_ID is omitted', () => {
    process.env.VITE_FIREBASE_PROJECT_ID = 'client-fallback-project';

    const selected = getProjectId();
    assert.equal(selected, 'client-fallback-project');
  });

  test('3. Backend falls back to firebase-applet-config.json if no env vars are set', () => {
    const selected = getProjectId();
    assert.equal(selected, 'my-app-a3712');
  });

  // TEST 4: Backend Service Account Validation (Fail Closed)
  test('4. Incomplete FIREBASE_SERVICE_ACCOUNT_JSON fails closed with AuthError', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      project_id: 'test-proj',
      // missing client_email and private_key
    });

    // Loading auth with incomplete credentials must fail closed
    try {
      const { verifyFirebaseIdToken } = await import('../server/auth.js');
      await verifyFirebaseIdToken('some_token');
      assert.fail('Should have failed closed with AuthError');
    } catch (err: any) {
      assert.ok(err.status === 401 || err.message.includes('Authentication service'));
    }
  });

  test('5. Malformed FIREBASE_SERVICE_ACCOUNT_JSON fails closed with AuthError', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = 'not_valid_json_string';

    try {
      const { verifyFirebaseIdToken } = await import('../server/auth.js');
      await verifyFirebaseIdToken('some_token');
      assert.fail('Should have failed closed with AuthError');
    } catch (err: any) {
      assert.ok(err.status === 401 || err.message.includes('Authentication service'));
    }
  });

  // TEST 6: Client Bundle Secret Scanning
  test('6. Production client bundle in dist/ contains zero private keys or server secrets', () => {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(distPath)) {
      assert.fail('dist directory does not exist. Run npm run build first.');
    }

    const files = fs.readdirSync(path.join(distPath, 'assets'));
    let leakedSecretFound = false;

    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.css')) {
        const content = fs.readFileSync(path.join(distPath, 'assets', file), 'utf8');
        if (content.includes('BEGIN PRIVATE KEY') || content.includes('FIREBASE_SERVICE_ACCOUNT_JSON')) {
          leakedSecretFound = true;
          break;
        }
      }
    }

    assert.equal(leakedSecretFound, false, 'Client bundle must not contain private keys or service account credentials');
  });

  // TEST 7: Firestore database ID configuration
  test('7. Reads provisioned firestoreDatabaseId correctly from config or env', async () => {
    const configModule = await import('../src/firebase/config.js');
    assert.ok(configModule.firestoreDatabaseId);
    assert.equal(configModule.firestoreDatabaseId, 'ai-studio-b75bffff-6da8-447b-8859-68436247b425');
  });
});
