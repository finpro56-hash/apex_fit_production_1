/**
 * Apex Fit — Gemini AI Integration Hardening Test Suite
 *
 * Covers:
 * 1. Missing Gemini key configuration error (HTTP 503).
 * 2. Valid configured model recognition.
 * 3. Unsupported model rejection and safe fallback.
 * 4. Gemini quota/rate-limit error handling (HTTP 429).
 * 5. Malformed text request validation (HTTP 400).
 * 6. Invalid image type rejection (HTTP 400).
 * 7. Oversized image payload rejection (HTTP 400).
 * 8. Unauthenticated AI request rejection (HTTP 401).
 * 9. Guest request support with isolated limits.
 * 10. Valid food-analysis request processing.
 * 11. Valid AI coaching request processing.
 * 12. AI quota rate-limit enforcement.
 */

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  createApp,
  envModels,
  isValidModelName,
  setGeminiGeneratorForTesting,
} from '../server/app.js';
import { setTokenVerifierForTesting } from '../server/auth.js';

describe('Gemini Integration Hardening Suite', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;
  const originalEnv = { ...process.env };

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
    setGeminiGeneratorForTesting(null);
    setTokenVerifierForTesting(null);
    process.env = { ...originalEnv };
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    setGeminiGeneratorForTesting(null);
    setTokenVerifierForTesting(null);
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // TEST 1: Missing Gemini API key
  test('1. Missing Gemini API key returns HTTP 503 safe configuration error', async () => {
    delete process.env.GEMINI_API_KEY;

    const res = await fetch(`${baseUrl}/api/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer guest_session',
      },
      body: JSON.stringify({ message: 'What is a good post-workout snack?' }),
    });

    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.error, 'AI service is temporarily unavailable. Missing service configuration.');
  });

  // TEST 2: Valid configured model
  test('2. Recognizes and accepts valid Gemini model names', () => {
    assert.equal(isValidModelName('gemini-3.8-flash'), true);
    assert.equal(isValidModelName('gemini-2.5-flash'), true);
    assert.equal(isValidModelName('gemini-flash-latest'), true);

    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    const models = envModels();
    assert.equal(models[0], 'gemini-2.5-flash');
  });

  // TEST 3: Unsupported model
  test('3. Rejects unsupported model names and safely defaults to gemini-3.8-flash', () => {
    assert.equal(isValidModelName('unsupported-model-gpt4'), false);
    assert.equal(isValidModelName('claude-3-opus'), false);
    assert.equal(isValidModelName(''), false);

    process.env.GEMINI_MODEL = 'unsupported-model-gpt4';
    const models = envModels();
    assert.equal(models[0], 'gemini-3.8-flash');
  });

  // TEST 4: Gemini quota or rate-limit error (HTTP 429)
  test('4. Gemini quota/rate-limit error returns HTTP 429 without churning fallback models', async () => {
    let callCount = 0;
    setGeminiGeneratorForTesting(async () => {
      callCount++;
      const quotaErr = new Error('Resource has been exhausted (e.g. check quota): 429 RESOURCE_EXHAUSTED');
      (quotaErr as any).status = 429;
      throw quotaErr;
    });

    const res = await fetch(`${baseUrl}/api/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer guest_session',
      },
      body: JSON.stringify({ message: 'How do I build stamina?' }),
    });

    assert.equal(res.status, 429);
    const data = await res.json();
    assert.ok(data.error.includes('rate limit reached or quota temporarily exhausted'));
    // Must stop after 1 attempt, not churn through all fallbacks
    assert.equal(callCount, 1);
  });

  // TEST 5: Malformed text request
  test('5. Malformed text request is rejected with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/extract-food-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer guest_session',
      },
      body: JSON.stringify({ text: '' }), // Empty text rejected by schema
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });

  // TEST 6: Invalid image MIME type
  test('6. Invalid image MIME format is rejected with HTTP 400', async () => {
    const res = await fetch(`${baseUrl}/api/analyze-food-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer guest_session',
      },
      body: JSON.stringify({
        imageBase64: 'aW1hZ2VkYXRhMTIzNDU2Nzg5MA==',
        mimeType: 'image/bmp', // Unsupported format
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('Unsupported image format'));
  });

  // TEST 7: Oversized image payload
  test('7. Oversized image payload (>8MB) is rejected with HTTP 400 before AI invocation', async () => {
    // 9MB synthetic base64 string
    const oversizedBase64 = 'A'.repeat(9 * 1024 * 1024);

    const res = await fetch(`${baseUrl}/api/analyze-food-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer guest_session',
      },
      body: JSON.stringify({
        imageBase64: oversizedBase64,
        mimeType: 'image/jpeg',
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('Image payload exceeds maximum allowed size'));
  });

  // TEST 8: Unauthenticated AI request
  test('8. Unauthenticated AI requests are rejected with HTTP 401', async () => {
    const res = await fetch(`${baseUrl}/api/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello coach' }),
    });

    assert.equal(res.status, 401);
  });

  // TEST 9: Guest request support
  test('9. Guest request succeeds on AI coaching with scoped identity', async () => {
    setGeminiGeneratorForTesting(async () => ({
      text: 'Prioritize consistency, proper sleep, and whole foods for recovery.',
    }));

    const res = await fetch(`${baseUrl}/api/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer guest_session',
      },
      body: JSON.stringify({ message: 'Best tips for muscle recovery?' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.reply.includes('consistency'));
  });

  // TEST 10: Valid food-analysis request
  test('10. Valid food-analysis request returns parsed nutrition structure', async () => {
    setGeminiGeneratorForTesting(async () => ({
      text: JSON.stringify({
        meal: 'Lunch',
        foods: [
          {
            name: 'Grilled Salmon with Brown Rice',
            estimated_portion: '1 fillet, 1 cup rice',
            calories: 450,
            protein_g: 38,
            carbs_g: 45,
            fat_g: 12,
          },
        ],
        total_calories: 450,
        confidence: 0.95,
      }),
    }));

    const res = await fetch(`${baseUrl}/api/analyze-food-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer guest_session',
      },
      body: JSON.stringify({
        imageBase64: 'data:image/jpeg;base64,aW1hZ2VkYXRhMTIzNDU2Nzg5MA==',
        mimeType: 'image/jpeg',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.meal, 'Lunch');
    assert.equal(data.total_calories, 450);
    assert.equal(data.foods[0].protein_g, 38);
  });

  // TEST 11: Valid AI coaching request
  test('11. Valid AI coaching request delivers evidence-aware response', async () => {
    setGeminiGeneratorForTesting(async () => ({
      text: 'Progressive overload across 3-4 sessions per week with adequate protein drives strength gains.',
    }));

    const res = await fetch(`${baseUrl}/api/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer guest_session',
      },
      body: JSON.stringify({
        message: 'How many days per week should I lift weights for hypertrophy?',
        context: {
          recentWorkouts: [{ planTitle: 'Upper Body', date: '2026-10-07', completed: true, durationMinutes: 45 }],
        },
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.reply.includes('Progressive overload'));
  });

  // TEST 12: Rate-limit enforcement
  test('12. AI limiter enforces request quota', async () => {
    setGeminiGeneratorForTesting(async () => ({ text: 'response' }));

    // Send rapid requests until quota triggers
    let rateLimited = false;
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${baseUrl}/api/calculate-nutrition-goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer guest_session',
        },
        body: JSON.stringify({ heightCm: 180, weightKg: 80, age: 30, sex: 'male' }),
      });

      if (res.status === 429) {
        rateLimited = true;
        const data = await res.json();
        assert.ok(data.error.includes('limit reached'));
        break;
      }
    }

    assert.equal(rateLimited, true, 'Requests beyond quota must be rate-limited with HTTP 429');
  });
});
