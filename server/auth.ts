/**
 * Server-side Firebase Authentication and Authorization Middleware.
 *
 * Enforces strict Firebase ID token verification via Firebase Admin SDK.
 * Rejects invalid, expired, or unverifiable tokens with HTTP 401.
 * Fails closed on misconfiguration or verification failure.
 */
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

export class AuthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 401, code = 'UNAUTHENTICATED') {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

export interface VerifiedAuthUser {
  uid: string;
  email?: string;
  isGuest: boolean;
}

export type TokenVerifier = (token: string) => Promise<{ uid: string; email?: string }>;

let testTokenVerifier: TokenVerifier | null = null;

/**
 * Allows test suites to inject a mock token verifier without network dependencies.
 */
export function setTokenVerifierForTesting(verifier: TokenVerifier | null) {
  testTokenVerifier = verifier;
}

function getAppletConfig() {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

export function getProjectId(): string | undefined {
  const appletConfig = getAppletConfig();
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    appletConfig?.projectId
  );
}

function getCredential() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON missing required fields (project_id, client_email, private_key)');
      }
      return cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: String(parsed.private_key || '').replace(/\\n/g, '\n'),
      });
    } catch (parseErr) {
      console.error('[Auth Security] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON');
      throw new AuthError('Authentication service misconfigured: Invalid FIREBASE_SERVICE_ACCOUNT_JSON', 401, 'INVALID_SERVICE_ACCOUNT');
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (clientEmail && privateKey) {
    const projectId = getProjectId();
    if (!projectId) {
      throw new AuthError('Authentication service misconfigured: FIREBASE_PROJECT_ID required with service account key', 401, 'MISCONFIGURED');
    }
    return cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    });
  }

  return applicationDefault();
}

function ensureFirebaseAdmin() {
  if (getApps().length > 0) return;

  const projectId = getProjectId();
  if (!projectId) {
    throw new AuthError('Authentication service misconfigured: FIREBASE_PROJECT_ID missing', 401, 'MISCONFIGURED');
  }

  try {
    initializeApp({
      credential: getCredential(),
      projectId,
    });
  } catch (initErr) {
    console.error('[Auth Security] Firebase Admin initialization error:', initErr instanceof Error ? initErr.message : initErr);
    throw new AuthError('Authentication service initialization failed', 401, 'ADMIN_INIT_FAILURE');
  }
}

/**
 * Verifies a Firebase ID token using Firebase Admin SDK or test verifier.
 * Strictly checks signature, project target, and expiration.
 */
export async function verifyFirebaseIdToken(token: string): Promise<VerifiedAuthUser> {
  // Test injection path
  if (testTokenVerifier) {
    const decoded = await testTokenVerifier(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      isGuest: false,
    };
  }

  ensureFirebaseAdmin();

  const projectId = getProjectId();
  const decodedToken = await getAuth().verifyIdToken(token);

  // Audience / Project target check
  if (decodedToken.firebase?.projectId && projectId && decodedToken.firebase.projectId !== projectId) {
    console.warn(`[Auth Security] Project ID mismatch: expected ${projectId}, got ${decodedToken.firebase.projectId}`);
    throw new AuthError('Invalid authentication token.', 401, 'PROJECT_MISMATCH');
  }

  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    isGuest: false,
  };
}

/**
 * Standard authentication middleware:
 * Rejects invalid, expired, malformed, or missing tokens with HTTP 401.
 * Supports legitimate guest session token ('guest_session') with strict scoping.
 * NEVER authorizes a request after verification failure.
 * NEVER assigns generic fallback user IDs.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Explicit legitimate guest session check
    if (token === 'guest_session') {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      res.locals.uid = `guest:${clientIp}`;
      res.locals.isGuest = true;
      return next();
    }

    // Any other token must be verified via Firebase Admin
    try {
      const verified = await verifyFirebaseIdToken(token);
      res.locals.uid = verified.uid;
      res.locals.email = verified.email;
      res.locals.isGuest = false;
      return next();
    } catch (verifyError: any) {
      const code = verifyError?.code || '';
      if (code === 'auth/id-token-expired') {
        console.warn('[Auth Security] Expired Firebase ID token');
        return res.status(401).json({ error: 'Session expired. Please sign in again.' });
      }
      if (code === 'auth/invalid-id-token' || code === 'auth/argument-error' || code === 'auth/id-token-revoked') {
        console.warn('[Auth Security] Malformed or invalid Firebase ID token');
        return res.status(401).json({ error: 'Invalid authentication token.' });
      }

      console.error('[Auth Security] Firebase token verification failure:', verifyError instanceof Error ? verifyError.message : verifyError);
      return res.status(401).json({ error: 'Authentication verification failed. Please sign in again.' });
    }
  } catch (error) {
    console.error('[Auth Security] Unexpected authentication error:', error instanceof Error ? error.message : error);
    return res.status(401).json({ error: 'Authentication failed.' });
  }
}

/**
 * Strict middleware for privileged endpoints that require a verified Firebase account.
 * Rejects guest sessions with HTTP 403 Forbidden.
 */
export async function requireVerifiedUser(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (res.locals.isGuest) {
      return res.status(403).json({ error: 'This action requires a signed-in account.' });
    }
    next();
  });
}
